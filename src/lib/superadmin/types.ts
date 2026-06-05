/** Return shape for super-admin server actions (used with useActionState). */
export interface ActionState {
  error?: string;
  ok?: boolean;
  // create-admin success payload (shown once):
  createdEmail?: string;
  tempPassword?: string;
}
