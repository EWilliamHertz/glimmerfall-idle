import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { DAILY_QUEST_CATALOG } from './game/catalog';
import { getUtcDateKey } from './game/engine';
import type { CovenantId, DailyQuestProgress } from './game/types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeAuthState(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export interface FirestoreUserProfile {
  uid: string;
  email: string;
  displayName: string;
  covenant: CovenantId;
  playerId: string;
  photoUrl: string;
  role: 'warden';
}

function sanitizeDisplayName(raw: string | null | undefined): string {
  const cleaned = (raw ?? 'Glade Warden').replace(/[<>]/g, '').trim().slice(0, 40);
  return cleaned.length >= 2 ? cleaned : 'Glade Warden';
}

function sanitizePlayerId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned.length >= 6 ? cleaned : `gf_${cleaned.padEnd(6, '0')}`;
}

export async function registerOrSyncUserProfile(
  user: User,
  preferredCovenant: CovenantId,
  fallbackPlayerId: string,
): Promise<FirestoreUserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const safePlayerId = sanitizePlayerId(`gf_${user.uid.slice(0, 24)}` || fallbackPlayerId);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<FirestoreUserProfile>;
      return {
        uid: user.uid,
        email: data.email ?? user.email ?? '',
        displayName: sanitizeDisplayName(data.displayName ?? user.displayName),
        covenant: (data.covenant as CovenantId) ?? preferredCovenant,
        playerId: sanitizePlayerId(data.playerId ?? safePlayerId),
        photoUrl: (data.photoUrl ?? user.photoURL ?? '').slice(0, 512),
        role: 'warden',
      };
    }

    const newProfile: FirestoreUserProfile = {
      uid: user.uid,
      email: (user.email ?? '').slice(0, 254),
      displayName: sanitizeDisplayName(user.displayName),
      covenant: preferredCovenant,
      playerId: safePlayerId,
      photoUrl: (user.photoURL ?? '').slice(0, 512),
      role: 'warden',
    };

    await setDoc(ref, {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfileInFirestore(
  uid: string,
  updates: Partial<Pick<FirestoreUserProfile, 'displayName' | 'covenant' | 'playerId' | 'photoUrl'>>,
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const sanitized: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.displayName !== undefined) {
    sanitized.displayName = sanitizeDisplayName(updates.displayName);
  }
  if (updates.covenant !== undefined) {
    sanitized.covenant = updates.covenant;
  }
  if (updates.playerId !== undefined) {
    sanitized.playerId = sanitizePlayerId(updates.playerId);
  }
  if (updates.photoUrl !== undefined) {
    sanitized.photoUrl = updates.photoUrl.slice(0, 512);
  }
  try {
    await updateDoc(ref, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function ensureTodayDailyQuestsDoc(
  uid: string,
  dateKey = getUtcDateKey(),
): Promise<DailyQuestProgress> {
  const path = `users/${uid}/dailyQuests/${dateKey}`;
  const ref = doc(db, 'users', uid, 'dailyQuests', dateKey);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        dateKey,
        tapsCompleted: Number(data.tapsCompleted ?? 0),
        upgradesCompleted: Number(data.upgradesCompleted ?? 0),
        duelsCompleted: Number(data.duelsCompleted ?? 0),
        blocksAnchored: Number(data.blocksAnchored ?? 0),
        claimedQuestIds: Array.isArray(data.claimedQuestIds) ? data.claimedQuestIds : [],
        streakCount: Number(data.streakCount ?? 0),
        status: data.status === 'all_claimed' ? 'all_claimed' : 'active',
      };
    }

    const initial: DailyQuestProgress = {
      dateKey,
      tapsCompleted: 0,
      upgradesCompleted: 0,
      duelsCompleted: 0,
      blocksAnchored: 0,
      claimedQuestIds: [],
      streakCount: 0,
      status: 'active',
    };

    await setDoc(ref, {
      ownerId: uid,
      dateKey,
      tapsCompleted: 0,
      upgradesCompleted: 0,
      duelsCompleted: 0,
      blocksAnchored: 0,
      claimedQuestIds: [],
      streakCount: 0,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return initial;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeTodayDailyQuests(
  uid: string,
  dateKey: string,
  onData: (progress: DailyQuestProgress) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const path = `users/${uid}/dailyQuests/${dateKey}`;
  const ref = doc(db, 'users', uid, 'dailyQuests', dateKey);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onData({
        dateKey,
        tapsCompleted: Number(data.tapsCompleted ?? 0),
        upgradesCompleted: Number(data.upgradesCompleted ?? 0),
        duelsCompleted: Number(data.duelsCompleted ?? 0),
        blocksAnchored: Number(data.blocksAnchored ?? 0),
        claimedQuestIds: Array.isArray(data.claimedQuestIds) ? data.claimedQuestIds : [],
        streakCount: Number(data.streakCount ?? 0),
        status: data.status === 'all_claimed' ? 'all_claimed' : 'active',
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function saveDailyQuestProgressToFirestore(
  uid: string,
  progress: DailyQuestProgress,
): Promise<void> {
  if (progress.status === 'all_claimed') return;
  const path = `users/${uid}/dailyQuests/${progress.dateKey}`;
  const ref = doc(db, 'users', uid, 'dailyQuests', progress.dateKey);
  try {
    await updateDoc(ref, {
      tapsCompleted: Math.min(100000, Math.max(0, Math.floor(progress.tapsCompleted))),
      upgradesCompleted: Math.min(10000, Math.max(0, Math.floor(progress.upgradesCompleted))),
      duelsCompleted: Math.min(1000, Math.max(0, Math.floor(progress.duelsCompleted))),
      blocksAnchored: Math.min(1000, Math.max(0, Math.floor(progress.blocksAnchored))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function claimDailyQuestInFirestore(
  uid: string,
  progress: DailyQuestProgress,
  questId: string,
): Promise<void> {
  if (progress.status === 'all_claimed') return;
  const allowedIds = new Set(DAILY_QUEST_CATALOG.map((q) => q.id));
  if (!allowedIds.has(questId)) return;

  const nextClaimed = Array.from(new Set([...progress.claimedQuestIds, questId])).slice(0, 6);
  const allClaimed = DAILY_QUEST_CATALOG.every((q) => nextClaimed.includes(q.id));
  const nextStreak = allClaimed ? progress.streakCount + 1 : progress.streakCount;

  const path = `users/${uid}/dailyQuests/${progress.dateKey}`;
  const ref = doc(db, 'users', uid, 'dailyQuests', progress.dateKey);
  try {
    await updateDoc(ref, {
      claimedQuestIds: nextClaimed,
      streakCount: Math.min(3650, Math.max(0, Math.floor(nextStreak))),
      status: allClaimed ? 'all_claimed' : 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
