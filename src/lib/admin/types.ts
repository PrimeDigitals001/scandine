/** Return shape for admin server actions (used with useActionState). */
export interface ActionState {
  error?: string;
  ok?: boolean;
  // credential flows show a one-time secret:
  createdEmail?: string;
  tempPassword?: string;
  // which staff row a reset belongs to (so the UI shows it on the right row):
  resetStaffId?: string;
}
