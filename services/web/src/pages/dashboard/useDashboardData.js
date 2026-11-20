import { useEffect, useState } from 'react'
import { getChannels, getDecisions, getMessages } from '../../api/chat'
import { listFiles } from '../../api/files'
import { getMembers } from '../../api/members'
import { getCurrentUserId } from '../../auth/keycloak'
import { buildActivities } from './activity'
import { browserStorage, countUnread } from './unread'

// 시연에서 다른 계정이 보낸 메시지가 몇 초 안에 보이도록 대시보드에 있는 동안 다시 불러온다
const REFRESH_MS = 15 * 1000
const RECENT_PER_CHANNEL = 3

const valueOf = (result) => (result.status === 'fulfilled' ? result.value : null)

async function recentMessages(channels) {
  const lists = await Promise.allSettled(
    channels.map((c) => getMessages(c.id, Math.max(0, c.lastSeq - RECENT_PER_CHANNEL), RECENT_PER_CHANNEL)),
  )
  return lists.flatMap((result) => valueOf(result) ?? [])
}

async function load(orgId) {
  const myId = getCurrentUserId()
  const [members, channels, files, decisions] = await Promise.allSettled([
    getMembers(orgId, 0, 100),
    getChannels(orgId),
    listFiles(orgId, 0, 5),
    getDecisions(orgId),
  ])
  const memberPage = valueOf(members)
  const channelList = valueOf(channels)
  const filePage = valueOf(files)
  const decisionList = valueOf(decisions)

  const names = Object.fromEntries((memberPage?.items ?? []).map((m) => [m.userId, m.displayName]))
  const nameOf = (id) => (id === myId ? '나' : names[id] ?? '알 수 없는 사용자')
  const storage = browserStorage()

  return {
    members: memberPage?.total ?? null,
    unread: channelList ? (storage && myId ? countUnread(storage, myId, channelList) : 0) : null,
    files: filePage?.total ?? null,
    decisions: decisionList?.length ?? null,
    activities: buildActivities({
      messages: channelList ? await recentMessages(channelList) : [],
      files: filePage?.items ?? [],
      decisions: decisionList ?? [],
      channels: channelList ?? [],
      nameOf,
    }),
  }
}

// active는 대시보드 메뉴를 보고 있는지. 채팅에서 돌아오면 바로 다시 불러와 새 메시지 수를 줄인다
export function useDashboardData(orgId, active) {
  const [data, setData] = useState({ loading: true })

  useEffect(() => {
    if (!active) return undefined
    let ignore = false
    // 실패하면 이전 값을 그대로 두고 다음 주기에 다시 불러온다
    const refresh = () =>
      load(orgId)
        .then((next) => {
          if (!ignore) setData({ ...next, loading: false })
        })
        .catch(() => {})
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      ignore = true
      clearInterval(timer)
    }
  }, [orgId, active])

  return data
}
