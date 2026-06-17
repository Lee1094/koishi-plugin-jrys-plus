import { Context, Database, h } from 'koishi'
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

/* ── 文本渲染 ── */
function renderSignText(users: any[], config: any) {
  const divider = '┏' + '—'.repeat(config.borderwidth) + '┓'
  const midDivider = '┣' + '—'.repeat(config.borderwidth) + '┫'
  const endDivider = '┗' + '—'.repeat(config.borderwidth) + '┛'
  const header = [divider, `┃  🏆 签到排行榜 TOP.${config.limit} `, midDivider].join('\n')

  const rankings = users.map((user, index) => {
    const medal = index < 3 ? ['👑', '⭐', '✧'][index] : '•'
    const lines = [`┃ ${medal} ${index + 1}. ${user.displayName}`, `┃  📅${user.signCount.toLocaleString()} 天`]
    return lines.join('\n')
  }).join('\n\n')

  return [header, rankings, endDivider].join('\n')
}

/* ── 图片渲染 ── */
async function renderRankImage(
  ctx: Context,
  users: any[], totalUsers: number,
  limit: number,
) {
  try {
    const path = await resolveTemplatePath()
    let template = await fs.readFile(path, 'utf-8')

    const data = {
      type: 'sign',
      limit,
      channelName: '当前频道',
      totalUsers,
      updateTime: new Date().toLocaleString('zh-CN'),
      users: users.map(user => ({
        displayName: user.displayName,
        originalId: user.name,
        value: user.signCount,
      })),
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
  db: Database<any>,
  config: any,
) {

  function canUseImage(): boolean {
    return config.imageMode && !!ctx.puppeteer
  }

  async function getRankedUsers() {
    const all = await db.get('jrys', {}, { sort: { signCount: 'desc' } })
    if (!all.length) return null

    const users = all.slice(0, config.limit).map(u => ({
      ...u,
      displayName: String(u.name),
    }))
    return users
  }

  ctx.command(config.signCommand || 'jrysranksign')
    .action(async ({ session }) => {
      const users = await getRankedUsers()
      if (users === null) return '暂无数据'
      if (!users.length) return '当前频道暂无数据'

      if (canUseImage()) {
        const total = (await db.get('jrys', {})).length
        const img = await renderRankImage(ctx, users, total, config.limit)
        if (img) return img
      }
      return renderSignText(users, config)
    })
}
