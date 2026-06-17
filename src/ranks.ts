import { Context, h } from 'koishi'
import { LevelInfo } from './signin'
import { promises as fs } from 'fs'
import { resolve } from 'path'

/* ── 模板路径候选 ── */
const TEMPLATE_CANDIDATES = [
  resolve(__dirname, 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'src', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'lib', 'templates', 'rank-card.html'),
  resolve(process.cwd(), 'node_modules', 'koishi-plugin-jrys-plus', 'lib', 'templates', 'rank-card.html'),
]

async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try { await fs.access(candidate); return candidate } catch { /* next */ }
  }
  throw new Error('未找到 rank-card.html 模板文件')
}

/* ── 等级查询 ── */
const DEFAULT_LEVEL: LevelInfo = { level: 0, levelExp: 0, levelName: '无等级', levelColor: '#666666' }

function getLevelInfo(exp: number, levels: LevelInfo[]): LevelInfo {
  if (!levels?.length) return DEFAULT_LEVEL
  const sorted = [...levels].sort((a, b) => b.levelExp - a.levelExp)
  return sorted.find(l => exp >= l.levelExp) || sorted[sorted.length - 1]
}

/* ── 文本渲染 ── */
function renderExpText(users: any[], levelConfig: LevelInfo[], config: any) {
  const divider = '┏' + '—'.repeat(config.borderwidth) + '┓'
  const midDivider = '┣' + '—'.repeat(config.borderwidth) + '┫'
  const endDivider = '┗' + '—'.repeat(config.borderwidth) + '┛'
  const header = [divider, `┃  🏆 经验排行榜 TOP.${config.limit} `, midDivider].join('\n')

  const rankings = users.map((user, index) => {
    const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
    const expStr = user.exp.toLocaleString()
    let lines = [`┃ ${medal} ${index + 1}. ${user.displayName}`]

    if (config.next_ExpDisplay) {
      const sorted = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
      const cur = getLevelInfo(user.exp, levelConfig)
      const idx = sorted.findIndex(l => l.levelExp === cur.levelExp)
      const next = sorted[idx + 1]
      lines.push(next ? `┃  ⚡${expStr} exp (下一级:${next.levelExp} exp)` : `┃  ⚡${expStr} (Max)`)
    } else {
      lines.push(`┃  ⚡${expStr} exp`)
    }

    if (config.pre_next_LevelDisplay && levelConfig.length) {
      const sorted = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
      const cur = getLevelInfo(user.exp, levelConfig)
      const idx = sorted.findIndex(l => l.levelExp === cur.levelExp)
      const prev = sorted[idx - 1]?.levelName
      const next = sorted[idx + 1]?.levelName
      let line = '┃  ✨'
      if (prev) line += `${prev} → `
      line += `「${cur.levelName}」`
      if (next) line += ` → ${next}`
      lines.push(line)
    } else if (levelConfig.length) {
      lines.push(`┃  ✨${getLevelInfo(user.exp, levelConfig).levelName}`)
    }
    return lines.join('\n')
  }).join('\n\n')

  return [header, rankings, endDivider].join('\n')
}

function renderSignText(users: any[], levelConfig: LevelInfo[], config: any) {
  const divider = '┏' + '—'.repeat(config.borderwidth) + '┓'
  const midDivider = '┣' + '—'.repeat(config.borderwidth) + '┫'
  const endDivider = '┗' + '—'.repeat(config.borderwidth) + '┛'
  const header = [divider, `┃  🏆 签到排行榜 TOP.${config.limit} `, midDivider].join('\n')

  const rankings = users.map((user, index) => {
    const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
    let lines = [`┃ ${medal} ${index + 1}. ${user.displayName}`, `┃  📅${user.signCount.toLocaleString()} 天`]

    if (config.pre_next_LevelDisplay && levelConfig.length) {
      const sorted = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
      const cur = getLevelInfo(user.exp, levelConfig)
      const idx = sorted.findIndex(l => l.levelExp === cur.levelExp)
      const prev = sorted[idx - 1]?.levelName
      const next = sorted[idx + 1]?.levelName
      let line = '┃  ✨'
      if (prev) line += `${prev} → `
      line += `「${cur.levelName}」`
      if (next) line += ` → ${next}`
      lines.push(line)
    }
    return lines.join('\n')
  }).join('\n\n')

  return [header, rankings, endDivider].join('\n')
}

/* ── 图片渲染 ── */
async function renderRankImage(
  ctx: Context, type: 'exp' | 'sign',
  users: any[], totalUsers: number,
  limit: number, getLevelConfig: () => LevelInfo[],
) {
  try {
    const path = await resolveTemplatePath()
    let template = await fs.readFile(path, 'utf-8')
    const levelConfig = getLevelConfig()

    const data = {
      type,
      limit,
      channelName: '当前频道',
      totalUsers,
      updateTime: new Date().toLocaleString('zh-CN'),
      users: users.map(user => {
        const sorted = [...levelConfig].sort((a, b) => a.levelExp - b.levelExp)
        const cur = getLevelInfo(user.exp, levelConfig)
        const idx = sorted.findIndex(l => l.levelExp === cur.levelExp)
        const prev = sorted[idx - 1]?.levelName
        const nextObj = sorted[idx + 1]
        const nextName = nextObj?.levelName
        let levelProgression = ''
        if (prev) levelProgression += `${prev} → `
        levelProgression += `「${cur.levelName}」`
        if (nextName) levelProgression += ` → ${nextName}`
        return {
          displayName: user.displayName,
          originalId: user.name,
          value: type === 'exp' ? user.exp : user.signCount,
          levelName: cur.levelName,
          levelColor: cur.levelColor,
          currentLevelExp: cur.levelExp,
          nextLevelExp: nextObj?.levelExp ?? null,
          levelProgression,
        }
      }),
    }

    template = template.replace('{{DATA}}', JSON.stringify(data))
    const page = await ctx.puppeteer.page()
    try {
      await page.setContent(template)
      const element = await page.$('.card')
      if (!element) throw new Error('找不到 .card 元素')
      const imgBuf = await element.screenshot({ encoding: 'binary' })
      return h.image(imgBuf, 'image/png')
    } finally {
      await page.close()
    }
  } catch (e) {
    ctx.logger('jrys-plus').error('rank-img:', e)
    return null
  }
}

/* ── 注册排行命令 ── */
export function registerRanks(
  ctx: Context,
  config: any,
  getLevelConfig: () => LevelInfo[],
) {
  const logger = ctx.logger('jrys-plus')

  function canUseImage(): boolean {
    return config.imageMode && !!ctx.puppeteer
  }

  async function getRankedUsers(session: any, sortField: 'exp' | 'signCount') {
    const all = await ctx.database.get('jrys', {}, { sort: { [sortField]: 'desc' } })
    if (!all.length) return null

    const users = all.slice(0, config.limit).map(u => ({
      ...u,
      displayName: String(u.name),
    }))
    return users
  }

  ctx.command(config.expCommand || 'jrysranks')
    .action(async ({ session }) => {
      const users = await getRankedUsers(session, 'exp')
      if (users === null) return '暂无数据'
      if (!users.length) return '当前频道暂无数据'

      if (canUseImage()) {
        const total = (await ctx.database.get('jrys', {})).length
        const img = await renderRankImage(ctx, 'exp', users, total, config.limit, getLevelConfig)
        if (img) return img
      }
      return renderExpText(users, getLevelConfig(), config)
    })

  ctx.command(config.signCommand || 'jrysranksign')
    .action(async ({ session }) => {
      const users = await getRankedUsers(session, 'signCount')
      if (users === null) return '暂无数据'
      if (!users.length) return '当前频道暂无数据'

      if (canUseImage()) {
        const total = (await ctx.database.get('jrys', {})).length
        const img = await renderRankImage(ctx, 'sign', users, total, config.limit, getLevelConfig)
        if (img) return img
      }
      return renderSignText(users, getLevelConfig(), config)
    })
}
