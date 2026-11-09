function SkeletonBlock({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-sm bg-line/70 ${className}`} />
}

export function EventGridSkeleton({ count = 3, className = '' }) {
  return (
    <div
      role="status"
      aria-label="Loading events"
      aria-busy="true"
      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
    >
      <span className="sr-only">Loading events…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-64 flex-col border-t-[3px] border-line bg-white/50 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="mt-auto h-7 w-4/5" />
          <SkeletonBlock className="mt-3 h-4 w-3/5" />
          <SkeletonBlock className="mt-6 h-4 w-1/3" />
          <SkeletonBlock className="mt-5 h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

export function CheckoutSkeleton() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" role="status" aria-label="Loading checkout" aria-busy="true">
      <span className="sr-only">Loading checkout…</span>
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="mt-8 h-3 w-32" />
      <SkeletonBlock className="mt-3 h-10 w-4/5 sm:h-12" />
      <SkeletonBlock className="mt-4 h-4 w-48 max-w-full" />
      <div className="mt-8 space-y-6 border border-line bg-white/50 p-4 sm:p-6">
        <SkeletonBlock className="h-8 w-full" />
        <SkeletonBlock className="h-7 w-2/3" />
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    </main>
  )
}

export function ChatListSkeleton() {
  return (
    <div role="status" aria-label="Loading event chats" aria-busy="true" className="space-y-2 px-2 py-3">
      <span className="sr-only">Loading your event chats…</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex items-center gap-3 rounded-sm p-3">
          <SkeletonBlock className="size-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
