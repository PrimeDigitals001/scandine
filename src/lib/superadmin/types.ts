/** Return shape for super-admin server actions (used with useActionState). */
export interface ActionState {
  error?: string;
  ok?: boolean;
  // create-admin / reset success payload (shown once):
  createdEmail?: string;
  tempPassword?: string;
  // true when the operator typed the password (vs. an auto-generated one):
  manualPassword?: boolean;
  // which admin row a reset belongs to:
  resetUserId?: string;
}
