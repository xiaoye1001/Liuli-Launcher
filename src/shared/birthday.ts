/** 生日（MM-DD）：月份 01~12，日期按月份的天数（2 月可以是 29 日） */
export function isBirthday(value: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const month = Number(m[1])
  const day = Number(m[2])
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

/** 今天是不是这个生日（2 月 29 日生日在平年的 2 月 28 日过） */
export function isBirthdayToday(birthday: string, now = new Date()): boolean {
  if (!isBirthday(birthday)) return false
  const [month, day] = birthday.split('-').map(Number)
  if (now.getMonth() + 1 !== month) return false
  if (now.getDate() === day) return true
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1
  return month === 2 && day === 29 && !leap && now.getDate() === 28
}
