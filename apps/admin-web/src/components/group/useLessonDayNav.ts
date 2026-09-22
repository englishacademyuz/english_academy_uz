import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sessions as sessionsApi } from '../../lib/api'
import { toDateInputValue } from '../../lib/format'
import { isSameDay, startOfMonth } from '../../lib/dateRange'

/**
 * Shared by JournalView (attendance) and MarksMatrixView (grading): both are
 * "one row of controls per lesson day, today editable, history browsed one
 * day at a time" views, so they share the exact same day/month navigation
 * rather than each re-implementing it.
 *
 * Lesson-session dates (not attendance or assessment dates) drive the day
 * list, fetched one calendar month at a time -- a 20-student group meeting
 * daily for a year would otherwise ship its entire history just to show
 * today. Each month is its own react-query cache entry, so revisiting a
 * month already browsed this session doesn't re-fetch it.
 *
 * `initialDate` seeds the starting month/day instead of "today" -- used when
 * arriving from a calendar deep link (e.g. clicking a past lesson in the
 * weekly timetable) so the view opens already scoped to that lesson's date.
 */
export function useLessonDayNav(groupId: string, initialDate?: Date) {
  const now = useMemo(() => new Date(), [])
  const startDate = initialDate ?? now
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(startDate))
  const [selectedDate, setSelectedDate] = useState(startDate)
  // Set right before stepping to a month whose data isn't loaded yet -- once
  // that month's query resolves, an effect jumps to its first/last lesson day.
  const [pendingEdge, setPendingEdge] = useState<'start' | 'end' | null>(null)

  const isCurrentMonth =
    monthAnchor.getFullYear() === now.getFullYear() && monthAnchor.getMonth() === now.getMonth()
  const monthEnd = useMemo(
    () => new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1),
    [monthAnchor],
  )

  const sessionsQuery = useQuery({
    queryKey: ['group-sessions', groupId, monthAnchor.getFullYear(), monthAnchor.getMonth()],
    queryFn: () =>
      sessionsApi.listForGroup(groupId, { from: toDateInputValue(monthAnchor), to: toDateInputValue(monthEnd) }),
  })
  const sessions = sessionsQuery.data ?? []

  // Every past/today lesson day within the loaded month, oldest first -- browsed
  // one at a time via the chevrons rather than a grid of pills, so it fits the
  // fixed column-header band.
  const dates = useMemo(() => {
    const seen = new Set<string>()
    const list: Date[] = []
    for (const s of sessions) {
      const d = new Date(s.date)
      if (d > now) continue
      const key = d.toDateString()
      if (!seen.has(key)) {
        seen.add(key)
        list.push(d)
      }
    }
    if (isCurrentMonth && !seen.has(now.toDateString())) list.push(now)
    list.sort((a, b) => a.getTime() - b.getTime())
    return list
  }, [sessions, now, isCurrentMonth])

  // Once the month we just stepped into has loaded, land on its first/last
  // lesson day (or, if it has none, the edge of the calendar month itself).
  useEffect(() => {
    if (!pendingEdge || sessionsQuery.isFetching) return
    if (dates.length > 0) {
      setSelectedDate(pendingEdge === 'end' ? dates[dates.length - 1] : dates[0])
    } else {
      setSelectedDate(pendingEdge === 'end' ? new Date(monthEnd.getTime() - 1) : monthAnchor)
    }
    setPendingEdge(null)
  }, [pendingEdge, sessionsQuery.isFetching, dates, monthAnchor, monthEnd])

  const selectedIndex = dates.findIndex((d) => isSameDay(d, selectedDate))
  const canGoNext = !(isCurrentMonth && selectedIndex >= 0 && selectedIndex === dates.length - 1)
  const isSelectedToday = isSameDay(selectedDate, now)

  function goPrev() {
    if (selectedIndex > 0) {
      setSelectedDate(dates[selectedIndex - 1])
      return
    }
    setPendingEdge('end')
    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))
  }

  function goNext() {
    if (selectedIndex >= 0 && selectedIndex < dates.length - 1) {
      setSelectedDate(dates[selectedIndex + 1])
      return
    }
    if (!canGoNext) return
    setPendingEdge('start')
    setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))
  }

  function goToday() {
    setPendingEdge(null)
    setMonthAnchor(startOfMonth(now))
    setSelectedDate(now)
  }

  return {
    now,
    selectedDate,
    isSelectedToday,
    isFetching: sessionsQuery.isFetching,
    canGoNext,
    goPrev,
    goNext,
    goToday,
    /** This month's lesson sessions -- the same fetch that produced `dates`, exposed so
     * callers (e.g. JournalView, for the selected day's attendance) don't need a second query. */
    sessions,
    /** The currently loaded calendar month's bounds -- exposed so other per-day views (e.g.
     * MarksMatrixView) can fetch their own month-scoped data in step with this navigation. */
    monthAnchor,
    monthEnd,
  }
}
