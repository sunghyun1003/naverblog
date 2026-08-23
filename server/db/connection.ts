const strongModeAlias = /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|$))/i;

export function securePostgresConnectionString(connectionString: string): string {
  return connectionString.replace(strongModeAlias, "$1verify-full");
}
