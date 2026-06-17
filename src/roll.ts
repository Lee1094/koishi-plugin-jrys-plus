// 每日运势值、随机黄历事件

export class Jrys {
  constructor() {}

  seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }

  /** 同一天同一用户运势值固定（0~maxRange） */
  async getFortune(uid: number, maxRange: number = 100): Promise<number> {
    const etime = new Date().setHours(0, 0, 0, 0)
    const todaySeed = (Number(uid) * etime) % 1000000001
    return Math.floor(this.seededRandom(todaySeed) * maxRange)
  }

  /** 抽 4 个不重复的黄历事件 */
  async getRandomObjects(jsonObject: Array<any>, uid: number): Promise<Array<any>> {
    if (!Array.isArray(jsonObject) || jsonObject.length < 4) {
      throw new Error('事件列表至少需要 4 个')
    }
    const seed = await this.getFortune(uid)
    const randomIndexes: Set<number> = new Set()
    let counter = 0
    while (randomIndexes.size < 4) {
      randomIndexes.add(Math.floor(this.seededRandom(seed + counter) * jsonObject.length))
      counter++
    }
    return Array.from(randomIndexes).map(i => jsonObject[i])
  }
}
