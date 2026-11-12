// 小游戏 UI 的中文文案。
//
// 战斗数值和卡牌/营地/祝福都在共享引擎 src/60-data.js 里，原文是英文，
// 因为同一份数据还要供浏览器版（英文界面）使用。小游戏界面是中文的，
// 所以这里按稳定 id 补一层中文，只影响本端显示，不改共享数据。
// 找不到对应条目时一律回落到英文原文，便于以后新增内容不会显示空白。

const CLASS = {
  warden: { name: '守卫', role: '坦克', blurb: '以残破的盾牌，把暮影引向自己。' },
  reaver: { name: '掠夺者', role: '重近战', blurb: '一把巨剑，和挥得动它的分量。' },
  fletcher: { name: '弓手', role: '远程', blurb: '一张与射手等高的长弓。' },
  lamplighter: { name: '掌灯人', role: '火焰术士', blurb: '提着最后一盏还亮着的灯。' },
  apothecary: { name: '药师', role: '辅助', blurb: '药水、火罐，和一双快得看不清的手。' },
  rimebinder: { name: '缚霜者', role: '冰霜术士', blurb: '把荒原的寒意缚在一块苍白的碎晶上。' }
};

// [名称, 说明]。说明里的「」是卡牌强化的那个技能。
const CARDS = {
  w_hp: ['橡木之心', '守卫：生命 +25%'],
  w_hold: ['铁壁', '「守阵」持续 +2 秒，减伤更多'],
  w_bash: ['阔面盾', '「盾击」击中范围内所有敌人，伤害 +25%'],
  w_rip: ['老兵', '「反击」触发更频繁，出手更重'],
  r_cleave: ['大弧', '「横扫」伤害与范围 +30%'],
  r_sunder: ['撼地', '「裂地」冷却缩短 20%，延伸更远'],
  r_wind: ['血气上涌', '「再起」更早触发，打得更狠'],
  r_dmg: ['磨利的刃', '掠夺者：伤害 +18%'],
  f_volley: ['满箭袋', '「箭雨」+3 支箭'],
  f_aimed: ['鹰眼', '「瞄准射击」伤害 +40%'],
  f_pin: ['倒刺箭簇', '被定身者减速更久，受伤 +15%'],
  f_haste: ['稳手', '弓手：攻速 +15%'],
  l_flare: ['余焰', '「焰爆」留下燃烧的地面'],
  l_kindle: ['暖炉', '「燃灯」治疗量 +30%'],
  l_cinder: ['烬暴', '「落烬」范围更大，燃烧伤害 +25%'],
  l_dmg: ['修剪灯芯', '掌灯人：伤害 +18%'],
  a_tonic: ['浓补药', '「补药」治疗量 +30%，并溅射附近队友'],
  a_fire: ['野火', '「火罐」燃烧 +2 秒，伤害 +25%'],
  a_quick: ['双倍剂量', '「水银」持续 +2 秒'],
  a_kit: ['野战药箱', '倒地英雄起身快 25%'],
  b_lance: ['碎枪', '「霜枪」伤害 +25%，寒冷更久'],
  b_hoar: ['深寒', '「白霜」范围更大，减速更强'],
  b_shatter: ['脆化', '「碎冰」伤害 +35%'],
  b_rime: ['麻痹霜', '被寒冷者伤害 -10%'],
  p_dmg: ['锋刃', '全队：伤害 +10%'],
  p_hp: ['坚韧', '全队：生命 +12%'],
  p_light: ['明亮灯火', '灯火范围 +15%'],
  p_haste: ['急行军', '全队：攻速 +7%'],
  p_silver: ['拾荒者', '银币 +25%'],
  p_flare: ['满储', '照明弹充能快 30%，燃烧伤害 +30%'],
  p_xp: ['苦训', '经验 +15%']
};

const CAMP = {
  whet: ['磨石', '全队伤害'],
  dress: ['野战包扎', '全队生命，波次之间恢复'],
  oil: ['灯油', '灯火范围，灯光中疗愈'],
  tonic: ['药剂', '携带药剂的数量与强度']
};

const BOONS = {
  dmg: ['愤怒余烬', '伤害 +6%，每局生效'],
  hp: ['坚忍余烬', '生命 +6%，每局生效'],
  silver: ['丰饶余烬', '银币 +10%，每局生效'],
  xp: ['记忆余烬', '经验 +8%，每局生效'],
  start: ['旅途余烬', '起始关卡前进一格'],
  apothecary: ['召唤药师', '立即解锁药师'],
  rimebinder: ['召唤缚霜者', '立即解锁缚霜者']
};

const ITEM = {
  'Arming Sword': '武装剑', Greatsword: '巨剑', Longbow: '长弓', 'Lantern Pole': '灯杖', 'Flask Belt': '药剂腰带', 'Shard Staff': '碎晶法杖',
  Hauberk: '锁子甲', 'Mail Shirt': '锁甲衣', 'Padded Jack': '衬甲', 'Waxed Coat': '蜡布外套', 'Apron Coat': '围裙罩袍', 'Winter Robe': '冬袍',
  'Wayfarer\u2019s Token': '旅人之证', 'Iron Ring': '铁戒', 'Tin Whistle': '锡哨', Knucklebone: '指骨', 'Sprig of Heather': '石楠枝', 'Flint and Steel': '火石与钢', 'Lead Charm': '铅符'
};
const RELIC = {
  Wickfall: '灯芯坠', Gloamrend: '暮裂', Barrowkeeper: '墓守', 'Ashen Vow': '灰誓', Moorwarden: '荒原守望', 'Last Light': '最后之光',
  Peatborn: '泥生者', Stormcrow: '风暴鸦', Emberwake: '余烬苏醒', Longnight: '长夜', Cairnsong: '石丘之歌', Hearthward: '炉火守护'
};

function pick(table, id, fallback) {
  const entry = table[id];
  return entry ? { name: entry[0], d: entry[1] } : { name: fallback.name, d: fallback.d };
}

module.exports = {
  names: CLASS,
  name: cls => (CLASS[cls] ? CLASS[cls].name : cls),
  role: cls => (CLASS[cls] ? CLASS[cls].role : ''),
  blurb: cls => (CLASS[cls] ? CLASS[cls].blurb : ''),
  card: card => pick(CARDS, card.id, card),
  camp: item => pick(CAMP, item.id, item),
  boon: item => pick(BOONS, item.id, item),
  // 装备名可能是「遗物, 基础名」的合成串，逐段翻译。
  item: name => String(name).split(', ').map(part => ITEM[part] || RELIC[part] || part).join('，')
};
