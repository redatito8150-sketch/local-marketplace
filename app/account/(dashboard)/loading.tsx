export default function AccountLoading() {
  return (
    <div className="animate-pulse space-y-7" aria-label="Loading your account" aria-busy="true">
      <div className="space-y-3">
        <div className="h-3 w-24 rounded-full bg-[var(--account-surface-muted)]" />
        <div className="h-10 w-72 max-w-full rounded-xl bg-[var(--account-surface-muted)]" />
        <div className="h-4 w-[520px] max-w-full rounded-full bg-[var(--account-surface-muted)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-40 rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)]" />
        ))}
      </div>
      <div className="h-80 rounded-[22px] border border-[var(--account-border)] bg-[var(--account-surface)]" />
    </div>
  );
}
