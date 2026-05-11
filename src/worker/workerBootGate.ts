/** Set after `parseWorkerEnv` succeeds (worker process boot). */
let envParsedOk = false;
/** Set after `validateWorkerSupabase` succeeds. */
let supabaseSanityOk = false;

export function markWorkerEnvParsedOk(): void {
  envParsedOk = true;
}

export function markWorkerSupabaseSanityOk(): void {
  supabaseSanityOk = true;
}

export function isWorkerEnvParsedOk(): boolean {
  return envParsedOk;
}

export function isWorkerSupabaseSanityOk(): boolean {
  return supabaseSanityOk;
}

/** Unit tests: simulate successful boot checks without running `main`. */
export function markWorkerBootChecksOkForTests(): void {
  envParsedOk = true;
  supabaseSanityOk = true;
}

export function resetWorkerBootGateForTests(): void {
  envParsedOk = false;
  supabaseSanityOk = false;
}
