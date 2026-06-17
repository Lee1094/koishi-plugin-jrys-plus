/**
 * koishi-plugin-jrys-plus
 * 今日运势签到 + 签到天数排行榜
 *
 * - 彩色星星替代运势文字
 * - 无经验/等级系统
 * - 仅签到天数排行榜
 */
import { Context, Schema, h, Logger } from 'koishi'
import { pathToFileURL } from 'url'
import fs from 'fs'
import path from 'path'
import type {} from 'koishi-plugin-puppeteer'
import type { Page } from 'puppeteer-core'

import * as si from './signin'
import { Jrys } from './roll'
import { RollEvent, defaultEventJson } from './event'
import { registerRanks } from './ranks'

export const name = 'jrys-plus'

/* ── 配置 ── */
export interface Config {
  imgUrl: string
  signExp: [number, number]
  event: RollEvent[]
  // 排行配置
  signCommand: string
  imageMode: boolean
  limit: number
  borderwidth: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Config = Schema.intersect([
  Schema.object({
    imgUrl: Schema.string().role('link')
      .description('随机横图api或者本地图片目录路径。填 URL 则直接用；填本地路径则随机取目录内图片。')
      .required(),
    signExp: Schema.tuple([Number, Number])
      .description('签到获得经验范围（仅用于后端累计，不在卡片展示）')
      .default([1, 100]),
  }).description('基础设置'),

  Schema.object({
    event: Schema.array(Schema.object({
      name: Schema.string().description('事件名称'),
      good: Schema.string().description('好的结局'),
      bad: Schema.string().description('坏的结局'),
    })).role('table').default([{ name: '网购', good: '买到超值好物', bad: '会被坑' }])
      .description('自定义黄历事件'),
  }).description('签到/运势设置'),

  Schema.object({
    signCommand: Schema.string().description('签到天数排行榜命令').default('jrysranksign'),
    imageMode: Schema.boolean().description('排行榜是否使用图片模式（需要 puppeteer）').default(true),
    limit: Schema.number().description('排行榜显示的最大条目数').min(1).max(100).default(10),
    borderwidth: Schema.number().description('文本模式边框宽度').default(14),
  }).description('排行榜设置'),
])

export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
}

const logger = new Logger('[JRYS+]')

/* ── 工具 ── */
async function getFolderImg(folder: string) {
  const files = await readFilenamesRecursive(folder)
  return files.filter(f => /\.(png|jpg|jpeg|ico|svg|webp)$/i.test(f))
}

function readFilenamesRecursive(dirPath: string): string[] {
  let result: string[] = []
  const entries = fs.readdirSync(dirPath)
  for (const name of entries) {
    const full = path.join(dirPath, name)
    result = result.concat(
      fs.statSync(full).isDirectory() ? readFilenamesRecursive(full) : [name],
    )
  }
  return result
}

async function fetchHitokoto() {
  try {
    const res = await fetch('https://v1.hitokoto.cn/?c=a&c=b&c=k')
    const { hitokoto: text, from, from_who } = await res.json() as any
    const author = from_who ? `—— ${from_who}「${from}」` : `——「${from}」`
    return `『${text}』<br>${author}`
  } catch {
    return '无法获取一言'
  }
}

/* ── 主入口 ── */
export function apply(ctx: Context, config: Config) {
  si.initDatabase(ctx)
  const db = ctx.database
  const puppeteer = ctx.puppeteer
  const signin = new si.Signin(db, config)
  const jrys = new Jrys()

  // 合并事件
  const eventJson: RollEvent[] = [...defaultEventJson, ...config.event]

  // 注册排行榜
  registerRanks(ctx, db, config)

  /* ── 运势签到命令 ── */
  ctx.command('jrys', '今日运势')
    .userFields(['id', 'name'])
    .action(async ({ session }) => {
      const date = new Date()

      let name = session.user?.name ? `@${session.user.name}` : ''
      name = name.length > 13 ? name.slice(0, 12) + '...' : name

      const luck = await jrys.getFortune(session.user.id)
      const sign = await signin.callSignin(session.user.id, session.author.id, luck)
      if (sign.status === 1) return '今天已经签到过了哦~'

      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      const [gd1, gd2, bd1, bd2] = await jrys.getRandomObjects(eventJson, session.user.id)
      const hitokoto = await fetchHitokoto()
      const greeting = signin.getGreeting(date.getHours())

      // 背景图
      let bgUrl: string
      if (/^https?:\/\//i.test(config.imgUrl)) {
        bgUrl = config.imgUrl
      } else {
        const imgs = await getFolderImg(config.imgUrl)
        const picked = imgs[Math.floor(Math.random() * imgs.length)] || ''
        bgUrl = pathToFileURL(path.resolve(config.imgUrl, picked)).href
      }

      const avatarUrl = session.author?.avatar || 'avatar.png'
      const gooddo = `${gd1.name}——${gd1.good}<br>${gd2.name}——${gd2.good}`
      const baddo = `${bd1.name}——${bd1.bad}<br>${bd2.name}——${bd2.bad}`

      let page: Page
      try {
        const template = fs.readFileSync(
          path.resolve(__dirname, 'templates', 'fortune.html'), 'utf-8',
        )

        const html = template
          .replace('{{BG_URL}}', bgUrl)
          .replace('{{AVATAR_URL}}', avatarUrl)
          .replace('{{GREETING}}', greeting)
          .replace('{{MONTH}}', month)
          .replace('{{DAY}}', day)
          .replace('{{HITOKOTO}}', hitokoto)
          .replace('{{NAME}}', name)
          .replace('{{LUCK}}', String(luck))
          .replace('{{UID}}', String(session.user.id))
          .replace('{{GOODDO}}', gooddo)
          .replace('{{BADDO}}', baddo)

        const outPath = path.resolve(__dirname, 'templates', '_fortune_render.html')
        fs.writeFileSync(outPath, html)

        page = await puppeteer.page()
        await page.setViewport({ width: 600, height: 1080 * 2 })
        await page.goto(`file:///${outPath}`)
        await page.waitForSelector('#body', { timeout: 10000 })
        const el = await page.$('#body')
        let msg: string | h
        if (el) {
          const buf = await el.screenshot({ encoding: 'binary' })
          msg = h.image(buf, 'image/png')
        } else {
          msg = '截图失败'
        }
        await page.close()
        return h('message', [h.quote(session.event.message.id), msg])
      } catch (e) {
        logger.error(e)
        return '出错了，请稍后重试'
      }
    })
}

export default { name, apply, Config }
