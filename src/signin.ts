import { Context, Database } from 'koishi'

declare module 'koishi' {
  interface Tables {
    jrys: _UserFortune
    username: _UsernameRecord
  }
}

export interface _UserFortune {
  id: number
  name: string
  time: Date
  exp: number
  signCount: number
}

export interface _UsernameRecord {
  id: number
  userId: string
  username: string
  platform: string
  channelId: string
  uid: string
}

/* ── 问候语 ── */
interface TimeGreeting {
  range: [number, number]
  message: string
}

const timeGreetings: TimeGreeting[] = [
  { range: [0, 5], message: '晚安' },
  { range: [5, 9], message: '早上好' },
  { range: [9, 11], message: '上午好' },
  { range: [11, 14], message: '中午好' },
  { range: [14, 18], message: '下午好' },
  { range: [18, 20], message: '傍晚好' },
  { range: [20, 24], message: '晚上好' },
]

/* ── 等级 ── */
export interface LevelInfo {
  level: number
  levelExp: number
  levelName: string
  levelColor: string
}

export const defaultLevelInfo: LevelInfo[] = [
  { level: 0, levelExp: 0, levelName: '不知名杂鱼', levelColor: '#838383' },
  { level: 1, levelExp: 500, levelName: '荒野漫步者', levelColor: '#838383' },
  { level: 2, levelExp: 1000, levelName: '拓荒者', levelColor: '#838383' },
  { level: 3, levelExp: 1500, levelName: '冒险家', levelColor: '#838383' },
  { level: 4, levelExp: 2000, levelName: '传说的冒险家', levelColor: '#000000' },
  { level: 5, levelExp: 3000, levelName: '隐秘收藏家', levelColor: '#000000' },
  { level: 6, levelExp: 4000, levelName: '言灵探索者', levelColor: '#42bc05' },
  { level: 7, levelExp: 5000, levelName: '水系魔法师', levelColor: '#42bc05' },
  { level: 8, levelExp: 6000, levelName: '水系魔导师', levelColor: '#42bc05' },
  { level: 9, levelExp: 8000, levelName: '藏书的魔女', levelColor: '#2003da' },
  { level: 10, levelExp: 10000, levelName: '人形图书馆', levelColor: '#2003da' },
  { level: 11, levelExp: 15000, levelName: '文明归档员', levelColor: '#2003da' },
  { level: 12, levelExp: 20000, levelName: '高塔思索者', levelColor: '#03a4da' },
  { level: 13, levelExp: 25000, levelName: '未知探索者', levelColor: '#03a4da' },
  { level: 14, levelExp: 30000, levelName: '背负真相之人', levelColor: '#9d03da' },
  { level: 15, levelExp: 35000, levelName: '守密人', levelColor: '#9d03da' },
  { level: 16, levelExp: 40000, levelName: '被缚的倒吊者', levelColor: '#9d03da' },
  { level: 17, levelExp: 45000, levelName: '崩毁世界之人', levelColor: '#f10171' },
  { level: 18, levelExp: 50000, levelName: '命运眷顾者', levelColor: '#f10171' },
  { level: 19, levelExp: 100000, levelName: '文明领航员', levelColor: '#c9b86d' },
  { level: 20, levelExp: 1000000, levelName: '天选之人', levelColor: '#ffd000' },
]

/* ── 运势描述 ── */
export interface FortuneInfo {
  luck: number
  desc: string
}

export const defaultFortuneInfo: FortuneInfo[] = [
  { luck: 0, desc: '走平坦的路但会摔倒的程度' },
  { luck: 5, desc: '吃泡面会没有调味包的程度' },
  { luck: 15, desc: '上厕所会忘记带纸的程度' },
  { luck: 20, desc: '上学/上班路上会堵车的程度' },
  { luck: 25, desc: '点外卖很晚才会送到的程度' },
  { luck: 30, desc: '点外卖会多给予赠品的程度' },
  { luck: 35, desc: '出门能捡到几枚硬币的程度' },
  { luck: 40, desc: '踩到香蕉皮不会滑倒的程度' },
  { luck: 50, desc: '玩滑梯能流畅滑到底的程度' },
  { luck: 60, desc: '晚上走森林不会迷路的程度' },
  { luck: 70, desc: '打游戏能够轻松过关的程度' },
  { luck: 80, desc: '抽卡能够大成功的程度' },
  { luck: 95, desc: '天选之人' },
]

/* ── 数据库初始化 ── */
export function initDatabase(ctx: Context) {
  ctx.model.extend('jrys', {
    id: 'integer',
    name: 'string',
    time: 'timestamp',
    exp: 'unsigned',
    signCount: 'unsigned',
  })
}

/* ── 签到逻辑 ── */
import { Jrys } from './roll'

export interface SigninConfig {
  signExp: [number, number]
  levelSet: LevelInfo[]
  fortuneSet: FortuneInfo[]
}

export function getLevelInfo(exp: number, levels: LevelInfo[]): LevelInfo {
  if (!levels?.length) return { level: 0, levelExp: 0, levelName: '无等级', levelColor: '#666666' }
  const sorted = [...levels].sort((a, b) => b.levelExp - a.levelExp)
  return sorted.find(l => exp >= l.levelExp) || sorted[sorted.length - 1]
}

export class Signin {
  constructor(
    private db: Database<any>,
    private cfg: SigninConfig,
  ) {}

  /** 执行签到。返回 0=成功, 1=已签到 */
  async callSignin(uid: number, userid: string, luck: number) {
    const date = new Date()

    // 经验值仅用于后端等级/排行计算，不在签到卡上展示
    const exp =
      Math.round(
        (Math.random() * 0.5 + luck / 200) *
          (this.cfg.signExp[1] - this.cfg.signExp[0]),
      ) + this.cfg.signExp[0]

    const userData = await this.db.get('jrys', { id: uid })

    if (userData.length === 0) {
      const accExp = exp
      await this.db.create('jrys', {
        id: uid,
        name: userid,
        time: date,
        exp: accExp,
        signCount: 1,
      })
      return { status: 0, allExp: accExp, signTime: date, count: 1 }
    }

    if (userData[0].time.getDate() === date.getDate()) {
      return { status: 1 }
    }

    const accExp = userData[0].exp + exp
    const accCount = userData[0].signCount + 1
    await this.db.set('jrys', { id: uid }, {
      name: userid,
      time: date,
      exp: accExp,
      signCount: accCount,
    })
    return { status: 0, allExp: accExp, signTime: date, count: accCount }
  }

  getLevelInfo(exp: number) {
    let index = 0
    for (let i = 0; i < this.cfg.levelSet.length; i++) {
      if (exp >= this.cfg.levelSet[i].levelExp) index++
      else break
    }
    let nExp: number | string
    if (index >= this.cfg.levelSet.length) nExp = '???'
    else nExp = this.cfg.levelSet[index].levelExp
    index--
    return { levelInfo: this.cfg.levelSet[index], nextExp: nExp }
  }

  getFortuneInfo(luck: number): string {
    let index = 0
    for (let i = 0; i < this.cfg.fortuneSet.length; i++) {
      if (luck >= this.cfg.fortuneSet[i].luck) index++
      else break
    }
    index--
    return this.cfg.fortuneSet[index].desc
  }

  getGreeting(hour: number): string {
    const g = timeGreetings.find(t => hour >= t.range[0] && hour < t.range[1])
    return g ? g.message : '你好'
  }
}
