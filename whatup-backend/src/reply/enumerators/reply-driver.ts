/** Reply-generation drivers, selected by REPLY_DRIVER. */
export enum ReplyDriver {
  /** Simulated 3–15 s delay with deterministic replies — dev/test, no credentials. */
  Fake = 'fake',
  /** LLM-generated replies via the Claude API. */
  Claude = 'claude',
}
