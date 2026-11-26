# GlimmerFall IDLE Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: Every unspecified Firestore document path rejects all reads and writes.
2. **PII Isolation**: `/users/{userId}` stores the player's verified email address and is strictly readable only by `userId == request.auth.uid` or a verified Admin. Blanket `isSignedIn()` reads are forbidden.
3. **No Self-Escalation**: During `/users/{userId}` creation, `role` MUST be `'warden'`. Admin identity is verified exclusively via verified admin email (`ewilliamhe@gmail.com`) or server-managed `/admins/{uid}` documents.
4. **Master Gate on Daily Quests**: `/users/{userId}/dailyQuests/{questDate}` requires the parent `/users/{userId}` document to exist on single-document reads/writes, and `ownerId` must equal `request.auth.uid` and remain immutable.
5. **Terminal State Locking**: Once a daily quest document reaches `status == 'all_claimed'`, further non-admin updates are blocked.
6. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and never change; `updatedAt` must equal `request.time` on every write.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on User Create**: `{ ...validUser, isAdmin: true }` -> Blocked by `keys().hasOnly(...)`.
2. **Self-Assigned Admin Role**: `{ ...validUser, role: 'admin' }` -> Blocked by `data.role == 'warden'`.
3. **Identity Spoofing on User Create**: Writing to `/users/victimUid` with `uid: 'attackerUid'` -> Blocked by `userId == request.auth.uid && data.uid == request.auth.uid`.
4. **Unverified Email Bypass**: Authenticated request where `email_verified == false` -> Blocked by `isVerifiedUser()`.
5. **Cross-User PII Read**: Non-owner attempting `get(/users/otherUid)` -> Blocked by `isOwner(userId) || isAdmin()`.
6. **Oversized Display Name Poisoning**: `displayName` of 500 characters -> Blocked by `displayName.size() >= 2 && displayName.size() <= 40`.
7. **Orphaned Daily Quest Write**: Creating `/users/{uid}/dailyQuests/2026-11-26` before `/users/{uid}` exists -> Blocked by Master Gate `exists(...)`.
8. **Malformed Quest Date Path ID**: Creating `/users/{uid}/dailyQuests/../../../evil` -> Blocked by `isValidDateId(questDate)`.
9. **Quest Array Injection / Unbounded List**: Setting `claimedQuestIds: ['fake_quest', ...]` or > 6 items -> Blocked by `.size() <= 6 && .hasOnly([...])`.
10. **Client-Forged Timestamp**: Setting `updatedAt` to a past timestamp instead of `request.time` -> Blocked by `incoming().updatedAt == request.time`.
11. **Terminal State Mutation**: Modifying `tapsCompleted` after `existing().status == 'all_claimed'` -> Blocked by `existing().status != 'all_claimed'`.
12. **Immutable Owner Tampering**: Updating `ownerId` or `createdAt` on an existing daily quest document -> Blocked by `affectedKeys().hasOnly(...)` and immutability checks.
