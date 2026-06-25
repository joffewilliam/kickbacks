export function codexRemoteTerminalArgs(endpoint: string): string[] {
  return ['--no-alt-screen', '--remote', endpoint];
}
