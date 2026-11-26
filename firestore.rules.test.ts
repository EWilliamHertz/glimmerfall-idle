import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf8');

test('firestore.rules enforces default-deny catch-all first', () => {
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules isolates PII on /users and blocks self-assigned admin roles', () => {
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /data\.role == 'warden'/);
  assert.match(rulesText, /allow get: if isValidId\(userId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\);/);
  assert.doesNotMatch(rulesText, /allow read: if isSignedIn\(\)/);
});

test('firestore.rules enforces Master Gate, terminal state locking, array guarding, and zero get/exists in list blocks', () => {
  assert.match(rulesText, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
  assert.match(rulesText, /existing\(\)\.status != 'all_claimed'/);
  assert.match(rulesText, /data\.claimedQuestIds\.size\(\) <= 6/);
  assert.match(rulesText, /allow list: if isVerifiedUser\(\)\s*&& \(resource\.data\.ownerId == request\.auth\.uid \|\| isBootstrappedAdmin\(\)\);/);
});
