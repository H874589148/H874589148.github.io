/* ================================================================
   人生长卷 · 内容库（data.js）
   ----------------------------------------------------------------
   挂载 window.__lifeData，由 script.js 消费。
   - DECISIONS      抉择事件池：{id,min,max,era,text,options:[{t,say,eff,tags,outfit,cond}]}
   - RANDOM_MINOR   随机小事（每推进一年 35% 概率抽到）
   - RANDOM_MAJOR   重大变故（每推进一年 10% 概率抽到，重大事件低频）
   - TITLES         结局称号评定表（顺序即优先级）
   - cond 条件键：minWealth/maxWealth/minIq/minTalent/minEq/minBody/
                  tag/anytag/notag/gender
   事件总量：童年22 / 少年26 / 青年26 / 中年18 / 后半生14 = 106 条
   ================================================================ */
(function () {
'use strict';

var ERA_GROUPS = { ancient: ['西汉','盛唐','北宋','大明','清朝'], minguo: ['民国'], modern: ['现代'] };
var ERA_OF = {};
Object.keys(ERA_GROUPS).forEach(function (g) { ERA_GROUPS[g].forEach(function (e) { ERA_OF[e] = g; }); });

var OCCUPATIONS = {
  ancient: ['农夫','渔夫','木匠','小商贩','落第书生','武将','县衙小吏','郎中'],
  minguo:  ['黄包车夫','纱厂工人','私塾先生','商铺掌柜','报馆编辑','西医大夫','军阀幕僚'],
  modern:  ['农民','厂工','教师','医生','个体户','公务员','程序员','企业高管']
};

var ATTRS = [
  ['iq','智商','学业与谋略'],
  ['eq','情商','人缘与处世'],
  ['talent','天赋','技艺与灵感'],
  ['body','体力','健康与命数'],
  ['wealth','财富','家底厚薄'],
  ['power','权力','门第势能']
];
var TOTAL_POINTS = 30;

/* ---------- 0-5 岁叙事 ---------- */
var INFANT_TEXTS = [
  { era:'any', text:'你在{occ}之家呱呱坠地。父亲粗糙的手掌托起你时，眼里有藏不住的笑意。' },
  { era:'any', text:'周岁抓周，满床物件里你一把攥住了{item}。众人哄笑，说这娃娃日后{omen}。' },
  { era:'any', text:'三岁那年你发了一场高热，母亲背着你连夜求医。好在底子{bodyword}，挺了过来。' },
  { era:'any', text:'你学会了走路，摇摇晃晃地追着院里的鸡跑，摔了也不哭，爬起来接着追。' },
  { era:'any', text:'夏夜纳凉，父亲指着星空给你讲他年轻时候的营生。你听得似懂非懂，却记住了他眼里的光。' },
  { era:'any', text:'弟弟妹妹出生那天，你踮着脚往襁褓里瞧，第一次明白自己成了哥哥/姐姐。' },
  { era:'ancient', text:'开蒙那天，私塾先生在你眉心点了一粒朱砂，念了句「学而时习之」。你跟着摇头晃脑。' },
  { era:'ancient', text:'第一次跟大人去赶集，庙会上你盯着捏糖人的老翁挪不动步，糖人举了一路舍不得吃。' },
  { era:'minguo', text:'弄堂里的皮影子戏一开锣，你挤在人堆最前排，看到忘了回家吃饭。' },
  { era:'modern', text:'幼儿园文艺汇演，你被画上红脸蛋唱了首歌。台下父母的掌声比谁都响。' },
  { era:'modern', text:'父母第一次带你去动物园/游乐园，你把长颈鹿和过山车都讲给了邻居家小孩听。' }
];
var ZHUAZHOU = {
  ancient: ['一杆毛笔','是个读书的苗子'],
  minguo:  ['一块怀表','是个守时细致的人'],
  modern:  ['一个计算器','跟数字有缘']
};
var CLASSICS = ['论语','孟子','诗经','大学','中庸'];

/* ================================================================
   抉择事件库 · 童年（5-14）22 条
================================================================ */
var DECISIONS = [
{ id:'c_play_study', min:5, max:7, era:'any',
  text:'{age}岁的夏天，蝉声聒噪。伙伴们在门外喊你下河摸鱼，桌上的功课还摊着没写完。',
  options:[
    { t:'先把功课做完再去玩', say:'你按捺住性子写完功课，才跑去河边。先生夸你自律。', eff:{iq:1}, tags:['disciplined'] },
    { t:'摸鱼要紧，功课回来再说', say:'你们摸了三条鲫鱼，晒得黝黑。功课熬到半夜才补完，但那个下午的快乐是真的。', eff:{body:1,eq:1}, tags:['playful'] },
    { t:'带着功课去河边，边玩边写', say:'你趴在石头上写字，写两笔看一眼水花。两样都没耽误，字却歪歪扭扭。', eff:{talent:1}, tags:['playful'] }
  ]},
{ id:'c_homework', min:7, max:9, era:'modern',
  text:'暑假快结束了，你的暑假作业还有大半本。班里有人早就写完，有人准备最后一天通宵。',
  options:[
    { t:'制定计划，每天写两页', say:'你给自己排了表，开学前三天从容收尾。老师把你的作业当范本展览。', eff:{iq:1,eq:1}, tags:['disciplined'] },
    { t:'最后三天疯狂赶工', say:'你体验了三天「生死时速」，居然也写完了。手心冒汗的感觉让你明白：拖延是要还利息的。', eff:{talent:1}, tags:['procrastinator'] },
    { t:'抄同桌的应付了事', say:'开学抽查，你抄错行的答案当场露馅，被罚站了一节课。', eff:{eq:-1}, tags:['tricky'] }
  ]},
{ id:'c_old_school', min:7, max:9, era:'ancient',
  text:'私塾里，先生要求背诵《{classic}》。同窗有人悬梁刺股，有人三天打鱼。',
  options:[
    { t:'悬梁刺股，日夜苦读', say:'你挑灯夜读，半年后将整本书倒背如流。先生抚须点头。', eff:{iq:2,body:-1}, tags:['studious'] },
    { t:'熟读成诵，张弛有度', say:'你晨起诵读、午后玩耍，进度不快却扎实。', eff:{iq:1}, tags:['studious'] },
    { t:'能溜则溜，下河摸鱼', say:'你的书背得七零八落，但水性练得十里八乡闻名。', eff:{body:1}, tags:['playful'] }
  ]},
{ id:'c_liyue', min:8, max:11, era:'ancient',
  text:'先生问你愿在「礼、乐、射、御、书、数」中精修哪一门。',
  options:[
    { t:'礼——进退有度，处世之基', say:'你习礼仪、明进退，言谈举止渐有章法。', eff:{eq:2}, tags:['li'] },
    { t:'乐——琴瑟在御，陶冶性情', say:'你学抚琴，指尖有了茧，心里有了山水。', eff:{talent:2}, tags:['yue','art'] },
    { t:'射——挽弓习武，强身健体', say:'你每日挽弓五十次，臂力渐长，目光如炬。', eff:{body:2}, tags:['she','martial'] },
    { t:'数——算筹经纬，经世致用', say:'你沉迷算学，账目货物到你手里一清二楚。', eff:{iq:2}, tags:['shu','abacus'] }
  ]},
{ id:'c_skill_ancient', min:9, max:12, era:'ancient',
  text:'家里商量着让你学一门傍身的手艺。',
  options:[
    { t:'随父学农务，识四时耕种', say:'你跟着父亲下地，学会了看天吃饭的本事，也晒脱了两层皮。', eff:{body:1,talent:1}, tags:['farming'] },
    { t:'拜木匠为师，学制器', say:'刨花的香气里，你练出了一手好木工。师傅说你有灵性。', eff:{talent:2}, tags:['carpenter'] },
    { t:'去武馆习武，强身健体', say:'冬练三九，你的拳脚渐渐有了章法。', eff:{body:2}, tags:['wuxia_basic'] },
    { t:'去药铺学徒，辨识百草', say:'你跟着坐堂郎中认药、捣药、抄方子，记下了百十种药性。', eff:{iq:1,talent:1}, tags:['herb'] }
  ]},
{ id:'c_skill_modern', min:9, max:12, era:'modern',
  text:'班里同学都在上兴趣班。母亲算了算家里的开销，让你自己挑一样。',
  options:[
    { t:'钢琴班（学费不便宜）', say:'家里咬牙给你报了名。你练会了第一首完整的曲子，母亲听哭了。', eff:{talent:2,wealth:-1}, tags:['piano','art'], cond:{ minWealth:4 } },
    { t:'画画班', say:'你的速写本越攒越厚，美术老师说你色感很好。', eff:{talent:2}, tags:['drawing','art'] },
    { t:'篮球/田径，练体育', say:'你在球场上挥汗如雨，个子蹿了一大截。', eff:{body:2}, tags:['sport'] },
    { t:'编程/奥数班', say:'你对着一行行代码和一道道难题，意外地坐得住。', eff:{iq:2}, tags:['coding'] },
    { t:'不上了，帮家里看店/干活', say:'你把学费省了下来。放学后的柜台和田埂，是你的另一间教室。', eff:{wealth:1,body:1}, tags:['work_early'], cond:{ maxWealth:5 } }
  ]},
{ id:'c_father', min:10, max:13, era:'any',
  text:'父亲问你要不要学着接手他的营生——「{occ}这门手艺，传给你，饿不死人。」',
  options:[
    { t:'认真学，这是家里的根', say:'你开始跟着父亲打下手。他的手艺，你学去了七成。', eff:{talent:1,eq:1}, tags:['inherit'] },
    { t:'婉拒：我想走自己的路', say:'父亲沉默了一会儿，说：「也好，路是你自己的。」', eff:{iq:1}, tags:['independent'] }
  ]},
{ id:'c_kind', min:6, max:10, era:'any',
  text:'雨天，你在路边发现一只受伤的流浪猫，蜷缩在墙角直哆嗦。',
  options:[
    { t:'抱回家，省下零嘴喂它', say:'小猫在你床头安了家。它好起来的那天，蹭了蹭你的手。', eff:{eq:1}, tags:['kind'] },
    { t:'送到兽医那儿，但养不起', say:'你掏空了攒的零钱给它治伤，然后看着它被好心人领养。', eff:{eq:1}, tags:['kind'] },
    { t:'只是路过', say:'你回头看了一眼，还是走了。这件事你记了很多年。', eff:{}, tags:[] }
  ]},
{ id:'c_rain_day', min:6, max:10, era:'ancient', cond:{ maxWealth:4 },
  text:'连下了三天雨，先生的学堂开课了，可家里的牛也该有人放。爹说：「家里只供得起一样。」',
  options:[
    { t:'冒雨去学堂，牛让爹想着办法', say:'你赤脚跑过泥泞，坐在最后一排听得入神。先生免了你的束脩，只要求你替他抄书。', eff:{iq:2,body:-1}, tags:['studious','poor_scholar'] },
    { t:'放牛要紧，学问以后再说', say:'你骑在牛背上背了半本《千字文》，牛认得回家的路，你认得字。', eff:{body:1,talent:1}, tags:['farming'] },
    { t:'雨天在家编竹筐补贴家用', say:'你的手指被篾条划了几道口子，筐却编得又快又好。', eff:{wealth:1,talent:1}, tags:['work_early'] }
  ]},
{ id:'c_newyear', min:6, max:11, era:'any',
  text:'年关将近，你手里攒下了一小串压岁钱。这是你一年里最「富有」的时刻。',
  options:[
    { t:'统统收进匣子，一文不动', say:'年底开匣，铜钱串得整整齐齐。母亲笑你是个过日子的手。', eff:{wealth:1}, tags:['frugal'] },
    { t:'买糖葫芦分给弟妹和邻家小孩', say:'你被孩子们围在中间，成了巷子里最风光的人。', eff:{eq:2}, tags:['kind'] },
    { t:'去书摊换两本旧书', say:'你抱着书回家，被油墨香熏了一路。', eff:{iq:1}, tags:['studious'] }
  ]},
{ id:'c_grandpa_story', min:6, max:10, era:'any',
  text:'冬夜，祖父/祖母在灯下讲古：前朝的将军、走西口的商队、山那边的传说。',
  options:[
    { t:'听得入迷，追着问个不停', say:'你把每个故事都记在心里，梦里都是金戈铁马。', eff:{iq:1,talent:1}, tags:['story_lover'] },
    { t:'一边听一边学着编草蚱蜢', say:'故事听了一半，手里的草蚱蜢倒编得有模有样。', eff:{talent:2}, tags:['craft'] },
    { t:'听着听着睡着了', say:'你在暖炉边睡得香甜。有些故事，长大后再读才懂。', eff:{body:1}, tags:[] }
  ]},
{ id:'c_bully', min:7, max:12, era:'any',
  text:'巷口的半大小子拦住你，要抢你新买的笔/刚蒸的白馍。',
  options:[
    { t:'据理力争，一步不退', say:'你涨红了脸瞪着他，围观的人多了，他悻悻走了。你学会了：理直才能气壮。', eff:{iq:1,eq:1}, tags:['brave'] },
    { t:'打不过就跑，改道上学', say:'你多绕了两里地，但保住了馍。君子不吃眼前亏。', eff:{body:1}, tags:['cautious'] },
    { t:'把馍分他一半，交个朋友', say:'后来他成了你最难的时候唯一肯借钱给你的人。', eff:{eq:2}, tags:['social'] }
  ]},
{ id:'c_needle_girl', min:7, max:11, era:'ancient', cond:{ gender:'女' },
  text:'母亲把绣绷递给你：「女孩子家，针线是安身的本事。」窗外，伙伴们正在踢毽子。',
  options:[
    { t:'静下心学女红，绣完第一方帕子', say:'你绣的并蒂莲被邻里夸了半年。母亲眼里有欣慰，也有一丝说不出的东西。', eff:{talent:2,eq:1}, tags:['needle'] },
    { t:'求母亲让你上午学绣、下午去玩', say:'你谈成了自己的第一桩「买卖」。帕子绣成了，毽子也没落下。', eff:{talent:1,eq:1}, tags:['needle','playful'] },
    { t:'偷偷把绣绷放下，跑去跳皮筋', say:'被母亲罚抄了半本《女诫》，你一边抄一边撇嘴。', eff:{body:1,eq:-1}, tags:['playful'] }
  ]},
{ id:'c_modern_move', min:8, max:12, era:'modern',
  text:'父亲工作调动，全家要搬去另一座城市。你要离开熟悉的学校和朋友了。',
  options:[
    { t:'收拾行李，期待新生活', say:'你在新学校的黑板上写下了自己的名字，交到了第一个新朋友。', eff:{eq:1,iq:1}, tags:['adaptive'] },
    { t:'难过了很久，给老同学写信', say:'你们通信多年。后来你明白：离开的人，其实从未真正离开。', eff:{eq:1}, tags:['nostalgic'] },
    { t:'赌气不吃不喝，抗议搬家', say:'抗议无效。但你把委屈画成了漫画，全班传阅。', eff:{talent:1}, tags:['drawing','art'] }
  ]},
{ id:'c_minguo_goods', min:7, max:11, era:'minguo',
  text:'街口新开了家洋货铺子，玻璃柜里摆着座钟、钢笔和画报。围观的孩子里三层外三层。',
  options:[
    { t:'天天去看西洋景，立志见世面', say:'你在心里悄悄记下「上海」「轮船」「大学」这些词，像是记下另一个世界。', eff:{iq:1,eq:1}, tags:['city_dream'] },
    { t:'跟掌柜讨价还价，帮工换糖', say:'掌柜夸你嘴皮子利索，收你做了编外小学徒。', eff:{wealth:1,eq:1}, tags:['merchant_kid'] },
    { t:'捡了张旧报纸，蹲在墙角读了一下午', say:'你不认识几个字，却把那半版新闻猜了个遍。', eff:{iq:2}, tags:['studious'] }
  ]},
{ id:'c_famine_child', min:6, max:12, era:'ancient', cond:{ maxWealth:3 },
  text:'年成坏了，粮价一日三涨。缸里的米浅得能看见底，母亲夜里总在叹气。',
  options:[
    { t:'跟着大人挖野菜、剥榆皮', say:'你认得了二十种能吃的草。饥饿教会你的，书本教不了。', eff:{body:-1,eq:1}, tags:['hardship'] },
    { t:'把口粮偷偷拨给更小的弟妹', say:'你饿得头晕，却看见弟妹碗里的粥稠了一些。', eff:{body:-1,eq:2}, tags:['kind','hardship'] },
    { t:'随父亲去大户人家帮工换粮', say:'你第一次见识了朱门。父亲说：记住这个滋味，别忘了。', eff:{wealth:1,iq:1}, tags:['hardship','work_early'] }
  ]},
{ id:'c_rich_child', min:7, max:12, era:'any', cond:{ minWealth:7 },
  text:'家里高朋满座。父亲让你出来见客，有人打趣：「小相公将来接掌家业？」',
  options:[
    { t:'大大方方行礼，对答如流', say:'满座宾客连声叫好。父亲捻须而笑，酒都多喝了三杯。', eff:{eq:2,power:1}, tags:['poised'] },
    { t:'躲回后院，找账房先生学算账', say:'账房的算盘声比满堂恭维声动听多了。', eff:{iq:2,wealth:1}, tags:['abacus'] },
    { t:'仗着家中富贵，耍起了少爷脾气', say:'你砸了仆人端来的点心碟。多年后你想道歉时，他已经告老还乡了。', eff:{eq:-2,power:1}, tags:['spoiled'] }
  ]},
{ id:'c_tree_boy', min:6, max:10, era:'any',
  text:'村口的老槐树听说有鸟窝。几个孩子打赌，看谁敢爬上去。',
  options:[
    { t:'挽起袖子第一个上', say:'你掏了两枚鸟蛋又放了回去——上去容易下来难，你在树上挂了半个时辰。', eff:{body:2}, tags:['playful','brave'] },
    { t:'在树下帮他们望风', say:'你学会了一件事：不冒险的人，也可以是队伍里不能少的人。', eff:{eq:1,iq:1}, tags:['cautious'] },
    { t:'不感兴趣，回家临帖', say:'窗外笑声一片，屋里墨香一缕。先生那天夸你的「永」字有筋骨。', eff:{iq:2}, tags:['studious'] }
  ]},
{ id:'c_bookshop', min:8, max:13, era:'any', cond:{ minIq:5 },
  text:'书肆/书店新到了一批书。你隔着柜台望过去，喉咙发干。',
  options:[
    { t:'天天蹲在书肆白看，看到能背', say:'掌柜的从嫌弃到习惯了你，偶尔还给你留个座。穷人家的图书馆，就是这么来的。', eff:{iq:2}, tags:['studious'] },
    { t:'攒三个月零花钱买下最想读的那本', say:'书到手那天，你给它包了书皮，睡觉都放在枕边。', eff:{iq:1,wealth:-1}, tags:['studious'] },
    { t:'借回来连夜抄完一本', say:'抄完最后一个字，天已蒙蒙亮。你记住了每一个字。', eff:{iq:2,body:-1}, tags:['studious'] }
  ]},
{ id:'c_left_behind', min:8, max:13, era:'modern', cond:{ maxWealth:4 },
  text:'过完年，父母要南下打工了。站台上的汽笛一响，奶奶攥紧了你的手。',
  options:[
    { t:'懂事地说「我会在家好好学习」', say:'你把想念写进每一篇作文。《我的爸爸》得了全班最高分，老师读到你哭了。', eff:{iq:1,eq:1}, tags:['hardship','dutiful'] },
    { t:'大哭大闹不让他们走', say:'母亲把你搂在怀里也哭了。那年的车票，退了一张。', eff:{eq:1,wealth:-1}, tags:['dutiful'] },
    { t:'把委屈憋在心里，成绩一落千丈', say:'没人发现你停在原地。直到期中考后，班主任来了家访。', eff:{iq:-1,eq:-1}, tags:['lonely'] }
  ]},
{ id:'c_teacher_praise', min:9, max:13, era:'any', cond:{ minIq:6 },
  text:'先生当众夸你：「此子悟性出众，将来必成大器。」同窗的目光齐刷刷投过来。',
  options:[
    { t:'再接再厉，功课加倍', say:'你在书页边写满了批注。先生的藏书，开始对你开放。', eff:{iq:2,body:-1}, tags:['studious'] },
    { t:'帮功课差的同学补课', say:'你讲一遍，自己懂三分；教别人，懂十分。', eff:{eq:2,iq:1}, tags:['mentor_kid'] },
    { t:'尾巴翘上了天，功课丢下不管', say:'下一次考校，你名落孙山。先生摇头：「伤仲永，惜哉。」', eff:{iq:-1,eq:-1}, tags:['proud'] }
  ]},
{ id:'c_siblings', min:7, max:13, era:'any',
  text:'母亲病了几天，家里的担子一下子压到你身上：弟妹要照顾，鸡鸭要喂。',
  options:[
    { t:'扛起家里，井井有条', say:'你学会了生火、熬粥、给弟妹扎辫子。母亲病好后直夸你。', eff:{eq:2,talent:1}, tags:['dutiful'] },
    { t:'手忙脚乱，还打碎了药罐', say:'狼狈了几天，但母亲笑着说你比她小时候强。', eff:{eq:1,wealth:-1}, tags:[] },
    { t:'把弟妹托给邻居，自己照旧去玩', say:'玩是玩了，愧疚也记下了。你欠家里一次。', eff:{eq:-1}, tags:['playful'] }
  ]},

/* ================================================================
   抉择事件库 · 少年（15-24）26 条
================================================================ */
{ id:'t_keju', min:15, max:17, era:'ancient',
  text:'县里传来消息，今科开试。寒窗这些年，是骡子是马，该拉出去遛遛了。',
  options:[
    { t:'寒窗冲刺，志在功名', say:'你闭门谢客三月，将经义文章磨了一遍又一遍。', eff:{iq:1}, tags:['exam_ready'], cond:{ minIq:5 } },
    { t:'自知不是读书的料，另谋出路', say:'你放下书本时反而松了口气。天大地大，不止科举一条路。', eff:{eq:1}, tags:[] },
    { t:'家里供不起了，先谋生', say:'你把笔墨收进箱底，跟着大人开始为生计奔波。', eff:{wealth:1,body:1}, tags:['work_early'], cond:{ maxWealth:4 } }
  ]},
{ id:'t_master', min:16, max:19, era:'ancient',
  text:'有四方名师路过此地开馆收徒，拜入谁门下，可能决定你一生的走向。',
  options:[
    { t:'拜武学宗师，仗剑江湖', say:'你扎马步、练拳桩，师傅说你是块练武的料。', eff:{body:2,talent:1}, tags:['wuxia'], outfit:'wuxia' },
    { t:'拜名医为师，悬壶济世', say:'你背《汤头歌》、认经络，跟着师傅出诊，见惯了生老病死。', eff:{iq:1,talent:1}, tags:['medic_path'], outfit:'medic' },
    { t:'拜大儒为师，研习经义', say:'你在经史子集里泡着，文章渐有筋骨。', eff:{iq:2}, tags:['ru_scholar'], outfit:'scholar' },
    { t:'随商队掌柜学做生意', say:'你跟着商队走南闯北，学会了看货、谈价、认人。', eff:{wealth:2,eq:1}, tags:['merchant_path'], outfit:'silk' }
  ]},
{ id:'t_marry_early', min:16, max:19, era:'ancient',
  text:'媒婆踏进家门，说邻乡有一门好亲事。父母之意，媒妁之言。',
  options:[
    { t:'听从父母之命，成家', say:'红烛高照，你与一个素未谋面的人拜了天地。日子淡而有味。', eff:{eq:1}, tags:['married'] },
    { t:'婉拒：我还想再闯闯', say:'你说服了父母。婚事暂且搁下，你的路还想再走远些。', eff:{iq:1}, tags:['single_mind'] }
  ]},
{ id:'t_travel', min:17, max:20, era:'ancient',
  text:'读万卷书，行万里路。有远行的商队/镖局愿意带上你。',
  options:[
    { t:'随队远行，见识山河', say:'你走过大漠孤烟、江南烟雨，眼界比出发时宽了十倍。', eff:{eq:2,body:1}, tags:['traveler'] },
    { t:'留守故里，守着家人', say:'你选择留下。家宅安宁，米缸常满，也是一种成就。', eff:{wealth:1}, tags:['homebody'] }
  ]},
{ id:'t_highschool', min:15, max:16, era:'modern',
  text:'中考成绩出来了。摆在你面前的有几条路。',
  options:[
    { t:'读普通高中，目标高考', say:'你背着书包走进高中校园。三年苦读，就此开始。', eff:{iq:1}, tags:['highschool'], cond:{ minIq:4 } },
    { t:'读职校，学一门技术', say:'你选了汽修/烹饪/护理。实操课上，你的手比谁都稳。', eff:{talent:2}, tags:['vocational'] },
    { t:'辍学打工，帮衬家里', say:'你把录取通知书折好收进抽屉，第二天就上了工位。', eff:{wealth:2,body:1}, tags:['dropout','work_early'], cond:{ maxWealth:5 } },
    { t:'出国读高中（费用高昂）', say:'你在机场和父母挥手告别。异国的月亮，确实不太一样。', eff:{eq:1,iq:1,wealth:-3}, tags:['overseas','highschool'], cond:{ minWealth:7 } }
  ]},
{ id:'t_art_exam', min:16, max:17, era:'modern',
  text:'专业课老师觉得你天赋不错，问你要不要考虑走艺考这条路。',
  options:[
    { t:'走艺考，拼一把热爱', say:'画室的灯常常亮到深夜。集训苦，但你眼里有光。', eff:{talent:2,wealth:-2}, tags:['art_exam','art'], cond:{ minTalent:5, minWealth:4 }, outfit:'sport' },
    { t:'老老实实走文化课', say:'你把画笔收好，扎进题海。热爱先寄存，未来再取。', eff:{iq:1}, tags:['highschool'] }
  ]},
{ id:'t_gaokao', min:17, max:19, era:'modern',
  text:'六月，高考。考场外的梧桐绿得发亮，你握笔的手心微微出汗。',
  options:[
    { t:'全力以赴，冲刺名校', say:'放榜那天，你的名字出现在{nameSchool}的录取名单上。', eff:{iq:1}, tags:['university'], cond:{ minIq:6 } },
    { t:'正常发挥，有学上就好', say:'你被一所普通的大学录取。父母依然摆了三桌酒。', eff:{eq:1}, tags:['university'] },
    { t:'考完就打工，大学以后再说', say:'你没等成绩出来就去了南方。流水线上的日子让你迅速长大。', eff:{wealth:2}, tags:['work_early'], cond:{ maxWealth:5 } }
  ]},
{ id:'t_minguo', min:15, max:19, era:'minguo',
  text:'时局动荡，报上天天在变。热血青年们都在寻找自己的出路。',
  options:[
    { t:'去大城市闯荡，见世面', say:'你挤上开往大城市的火车。霓虹与硝烟，你都见识了。', eff:{eq:2}, tags:['city_boy'], outfit:'student' },
    { t:'读书救国，考取新式学堂', say:'你在油灯下啃新书，德先生与赛先生住进了心里。', eff:{iq:2}, tags:['new_school','university'], outfit:'student' },
    { t:'继承家业，乱世求稳', say:'你守着家里的铺子，在风雨飘摇里护住了一家人的饭碗。', eff:{wealth:1}, tags:['inherit'] }
  ]},
{ id:'t_love', min:16, max:20, era:'any',
  text:'那个人出现在你的少年时代——每次目光相遇，你的心跳都会漏半拍。',
  options:[
    { t:'勇敢表白，哪怕被拒绝', say:'{loveResult}', eff:{eq:1}, tags:['first_love'] },
    { t:'把心事写进日记，以学业/前途为重', say:'你把那页日记折成了纸船。多年后想起，依然温柔。', eff:{iq:1}, tags:['single_mind'] }
  ]},
{ id:'t_major', min:18, max:20, era:'modern', cond:{ tag:'university' },
  text:'填志愿/定方向的时候到了。长辈说选热门的，朋友说选喜欢的。',
  options:[
    { t:'医学——长学制，但越老越吃香', say:'解剖楼的灯你见得最多。五年本科，只是开始。', eff:{iq:1}, tags:['major_medic'] },
    { t:'计算机/工科——热门高薪', say:'你的代码越写越溜，头发也肉眼可见地变少。', eff:{iq:1,talent:1}, tags:['major_cs'] },
    { t:'师范/文科——稳定清贫', say:'你说，总得有人去做点燃别人的事。', eff:{eq:1}, tags:['major_edu'] },
    { t:'艺术/体育——把热爱当饭吃', say:'质疑声不少，但站上舞台/赛场的那一刻都值了。', eff:{talent:2}, tags:['major_art','art'] }
  ]},
{ id:'t_girl_study', min:15, max:18, era:'ancient', cond:{ gender:'女' },
  text:'县里开了女塾，母亲却觉得「认得几个字就够了」。你自己心里有一杆秤。',
  options:[
    { t:'据理力争，进了女塾', say:'你成了塾里最用功的学生。先生的朱笔，第一次落在女学生的卷子上。', eff:{iq:2,eq:-1}, tags:['studious','pioneer'] },
    { t:'在家跟母亲学持家与女红', say:'你把家事打理得妥帖，绣活渐渐有了名气。', eff:{talent:2,wealth:1}, tags:['needle'] },
    { t:'白天帮工，夜里自学识字', say:'你用烧火棍在灰上练字。字写得歪，心却正。', eff:{iq:1,body:1}, tags:['hardship','studious'] }
  ]},
{ id:'t_girl_knight', min:17, max:22, era:'ancient', cond:{ gender:'女', anytag:['wuxia','wuxia_basic','she'] },
  text:'武馆师傅看着你练完一套拳，沉吟半晌：「这身功夫，窝在家里可惜了。」',
  options:[
    { t:'束起长发，随镖局走镖', say:'你换上劲装，同门只当你是师弟。三个月后，没人笑你。', eff:{body:2,eq:1}, tags:['knight_girl'], outfit:'wuxia' },
    { t:'留在乡里，教女娃娃们防身', say:'你的拳脚课，村里姑娘们挤破了头。', eff:{eq:2,talent:1}, tags:['mentor_girl'] },
    { t:'收起拳脚，依家里安排议亲', say:'你把练功服叠进箱底。偶尔深夜，还是会比划两式。', eff:{wealth:1}, tags:['married'] }
  ]},
{ id:'t_work_teen', min:15, max:18, era:'modern', cond:{ maxWealth:4 },
  text:'家里实在紧巴。亲戚捎话：南方厂里招工，包吃住，一个月能挣不少。',
  options:[
    { t:'南下进厂，寄钱回家', say:'流水线三班倒。你第一个月工资全寄了家，汇款单存了厚厚一沓。', eff:{wealth:2,body:-1}, tags:['work_early','hardship'] },
    { t:'留在县城学门手艺', say:'你在修理铺当学徒，机油味里泡出了真本事。', eff:{talent:2,wealth:1}, tags:['craft'] },
    { t:'咬牙继续读书，申请助学金', say:'你写了一份诚恳的申请。校长批了，还多给了你一份图书馆的差事。', eff:{iq:1,eq:1}, tags:['studious','hardship'] }
  ]},
{ id:'t_gaokao_after', min:18, max:20, era:'modern', cond:{ notag:'university' },
  text:'成绩不理想。摆在面前的是：复读一年，还是先走别的路？',
  options:[
    { t:'复读，再拼一次', say:'你把错题本翻烂了三本。第二年，命运给了你一个新的答案。', eff:{iq:2,body:-1}, tags:['highschool'] },
    { t:'读大专，学一门实在专业', say:'你在实训室里找到了乐趣。学历是敲门砖，手艺才是铁饭碗。', eff:{talent:2}, tags:['vocational'] },
    { t:'直接工作，社会也是大学', say:'你在社会大学里修完了「人情世故」这门最难的专业课。', eff:{wealth:1,eq:1}, tags:['work_early'] }
  ]},
{ id:'t_minguo_student', min:16, max:21, era:'minguo', cond:{ tag:'new_school' },
  text:'学堂里传阅着新出的进步刊物，同学们争论得面红耳赤。',
  options:[
    { t:'加入读书会，如饥似渴', say:'你在油印的传单里第一次读到「德先生」与「赛先生」，如闻惊雷。', eff:{iq:2,eq:1}, tags:['progressive'] },
    { t:'埋头功课，两耳不闻窗外事', say:'你的成绩始终名列前茅，只是偶尔也会望向窗外。', eff:{iq:1}, tags:['bookworm'] },
    { t:'上街游行，挥旗呐喊', say:'你的嗓子喊哑了。那天的风很大，旗帜猎猎作响。', eff:{eq:2,body:-1}, tags:['progressive','brave'] }
  ]},
{ id:'t_army', min:17, max:22, era:'any',
  text:'边关告急/时局动荡，征兵的告示贴上了墙。街上锣鼓喧天，也有人哭着送别。',
  options:[
    { t:'投身行伍，保家卫国', say:'你换上军装。母亲连夜纳的鞋底，垫在你脚上走了千里。', eff:{body:2,power:1,eq:-1}, tags:['army'] },
    { t:'留守家乡，尽孝养亲', say:'你目送同伴出征。后来的每一封信，你都读了很多遍。', eff:{eq:1}, tags:['dutiful'] },
    { t:'捐钱捐粮，出力不出丁', say:'你在后方的粮站忙了大半年。仗在前线打，粮在身后运。', eff:{wealth:-1,eq:1}, tags:[] }
  ]},
{ id:'t_craft_apprentice', min:15, max:18, era:'any', cond:{ minTalent:5 },
  text:'邻县有名的绣坊/木器行来镇上收徒，考的是手上功夫和眼力见。',
  options:[
    { t:'拜师学艺，三年为期', say:'学徒三年，你挨过骂、熬过夜，也练出了让人挑不出毛病的活计。', eff:{talent:2,wealth:1,body:-1}, tags:['craft','carpenter'] },
    { t:'婉拒：这门手艺吃不了饭', say:'师傅摇头走了。多年后你路过他的铺子，徒弟已出了一大堆。', eff:{}, tags:[] },
    { t:'边学徒边自学读书', say:'白天刨花飞，夜里书声琅。你成了十里八乡有名的「文武双全」。', eff:{talent:1,iq:1,body:-1}, tags:['craft','studious'] }
  ]},
{ id:'t_trade_boy', min:15, max:19, era:'any', cond:{ maxWealth:5 },
  text:'家里托人给你寻了条出路：去镇上的商铺当学徒，管吃住，没工钱。',
  options:[
    { t:'去当学徒，从头学起', say:'扫地、擦柜、打算盘。三年后，你拨算盘的手快过掌柜的眼睛。', eff:{wealth:1,eq:1}, tags:['merchant_kid','abacus'] },
    { t:'挑货郎担子，走街串巷', say:'你认得了八十个村子的人情世故，和一百种压价的套路。', eff:{body:1,eq:2,wealth:1}, tags:['merchant_path'] },
    { t:'去码头扛活，挣现钱', say:'汗水砸在地上摔八瓣。你的肩膀宽了一圈，脾气也硬了三分。', eff:{wealth:1,body:2}, tags:['work_early'] }
  ]},
{ id:'t_medicine_path', min:16, max:20, era:'any',
  text:'镇上老郎中/医学院招生，要求能吃苦、坐得住，还得背厚厚的医书。',
  options:[
    { t:'入行学医，救死扶伤', say:'你从碾药、抄方学起。师傅说：医者眼里没有贵贱，只有病人。', eff:{iq:1,talent:1,eq:1}, tags:['medic_path'], outfit:'medic' },
    { t:'怕见血光，望而却步', say:'你陪朋友去考了一次，回来做了个决定：你还是适合别的行当。', eff:{}, tags:[] },
    { t:'半工半读，在药铺打杂兼学', say:'你白天抓药晚上背书，掌柜的药柜，成了你的第一间课堂。', eff:{iq:1,wealth:1}, tags:['herb','medic_path'], outfit:'medic' }
  ]},
{ id:'t_love2', min:18, max:23, era:'any',
  text:'那个人又一次出现在你的生活里。这一次，你们的目光都躲不开了。',
  options:[
    { t:'认定就是这个人，托付真心', say:'你们在河边走了很长的路，把往后几十年的打算都说了个遍。', eff:{eq:2}, tags:['first_love'] },
    { t:'立业为重，情缘随缘', say:'你选择了先走自己的路。有些人，注定只能陪你一程。', eff:{iq:1,wealth:1}, tags:['single_mind'] }
  ]},
{ id:'t_club', min:19, max:22, era:'modern', cond:{ tag:'university' },
  text:'大学社团招新，摊位摆满了操场：文学社、球队、电台、辩论队、创业社……',
  options:[
    { t:'加入文学社/辩论队，以笔为剑', say:'你的文章第一次变成铅字时，你在报刊栏前站了十分钟。', eff:{iq:1,eq:1}, tags:['writing'] },
    { t:'进校队，把热爱练成本事', say:'赛季结束，你的球衣背后写满了名字——都是来合影的同学。', eff:{body:2,eq:1}, tags:['sport'] },
    { t:'泡实验室/图书馆，夯实专业', say:'你拿了两回奖学金，也把图书馆三楼的位置坐成了「专属座」。', eff:{iq:2}, tags:['studious'] },
    { t:'加入创业社，折腾小生意', say:'你在校园里倒卖过文具、办过跳蚤市场。没赚大钱，赚了一身胆。', eff:{eq:1,wealth:1}, tags:['startup_mind'] }
  ]},
{ id:'t_overseas_college', min:20, max:23, era:'modern', cond:{ tag:'university', minWealth:6 },
  text:'留学中介的顾问看着你的成绩单连连点头：「这个条件，可以冲更好的学校。」',
  options:[
    { t:'申请出国深造', say:'雅思、文书、签证。你拖着两个行李箱，飞向了另一种人生。', eff:{iq:1,eq:1,wealth:-3}, tags:['overseas'] },
    { t:'留在国内读研，稳扎稳打', say:'你选了本校最严的导师。三年，脱了一层皮，也长了一身本事。', eff:{iq:2}, tags:['master'] },
    { t:'家里供不起，放弃这条路', say:'你把宣传册还了回去。窗外的飞机拉出一条白线，你看了很久。', eff:{eq:-1,iq:1}, tags:[] }
  ]},
{ id:'t_minguo_work', min:17, max:22, era:'minguo', cond:{ maxWealth:5 },
  text:'家里的米缸见了底。父亲的旧识在上海的纱厂/报馆寻了个差事。',
  options:[
    { t:'进纱厂做工，挣辛苦钱', say:'机器声震得耳朵疼。你把工钱缝在贴身衣袋里，一分不敢乱花。', eff:{wealth:1,body:-1}, tags:['work_early'] },
    { t:'进报馆当排字学徒', say:'你认得全馆最多的字。夜里排完版，你把没用的铅字排成自己的名字。', eff:{iq:1,talent:1}, tags:['writing'] },
    { t:'跟船跑单帮，贩点杂货', say:'你在码头上学会了看脸色、认秤星、防扒手。', eff:{wealth:1,eq:1,body:1}, tags:['merchant_path'] }
  ]},
{ id:'t_ancient_marry_girl', min:16, max:20, era:'ancient', cond:{ gender:'女' },
  text:'你到了议亲的年纪。上门的媒人踏破了门槛，各有各的说法。',
  options:[
    { t:'嫁个殷实人家，安稳度日', say:'十里红妆，锣鼓喧天。你掀开盖头的那一刻，日子翻开了新的一页。', eff:{wealth:1,eq:1}, tags:['married'] },
    { t:'嫁给清贫但志气的读书人', say:'你当了陪嫁的银镯给他买书。你信他，也信自己没看走眼。', eff:{eq:2,wealth:-1}, tags:['married','poor_scholar'] },
    { t:'暂不议亲，先撑起家里的营生', say:'你把家里的小买卖打理得井井有条，媒人反倒不好开口了。', eff:{wealth:2,eq:1}, tags:['merchant_path'] }
  ]},
{ id:'t_sport_path', min:16, max:19, era:'any', cond:{ minBody:7 },
  text:'教练/武举教习看中了你的一身腱子肉：「跟着我，有你吃的苦，也有你出的头。」',
  options:[
    { t:'走武举/体校这条路', say:'你天不亮就起床训练。多年后你才知道，那些凌晨的路灯都记得你。', eff:{body:2,power:1}, tags:['sport','martial'] },
    { t:'把武艺当作强身的爱好', say:'你拒绝了职业的路，但每天清晨的百步拳，一打就是一辈子。', eff:{body:1,eq:1}, tags:['sport'] }
  ]},
{ id:'t_fail_exam', min:19, max:23, era:'ancient', cond:{ anytag:['exam_ready','ru_scholar'], notag:'university' },
  text:'放榜了，你的名字不在上面。同窗有人金榜题名，有人当场痛哭。',
  options:[
    { t:'擦干眼泪，三年后再来', say:'你把落榜的帖子贴在书桌前，日日相对。', eff:{iq:1,body:-1}, tags:['exam_ready','resilient'] },
    { t:'另辟蹊径，教书或经商', say:'你放下圣贤书，拿起了戒尺/算盘。路，果然不止一条。', eff:{wealth:1,eq:1}, tags:['teacher'] },
    { t:'心灰意冷，纵情山水', say:'你游荡了半年，写了一堆诗。诗不好，酒量倒是练出来了。', eff:{eq:-1,talent:1}, tags:['wanderer'] }
  ]},

/* ================================================================
   抉择事件库 · 青年（25-34）26 条
================================================================ */
{ id:'y_career_modern', min:24, max:26, era:'modern',
  text:'二十多岁，正式踏入社会。人生的岔路口，红绿灯闪得晃眼。',
  options:[
    { t:'进大厂/大公司，做螺丝钉', say:'工牌往脖子上一挂，你成了早高峰地铁里的千万分之一。', eff:{wealth:2}, tags:['whitecollar'], outfit:'suit' },
    { t:'考公务员/事业编，求安稳', say:'{gongResult}', eff:{}, tags:['try_gong'] },
    { t:'读研深造，再缓冲三年', say:'实验室和文献陪你又三年。学历确实涨了，头发确实少了。', eff:{iq:1,wealth:-1}, tags:['master'], cond:{ minIq:5 } },
    { t:'自由职业/小生意，自己说了算', say:'收入忽高忽低，但时间归自己支配。你给自己的生活按下了自定义键。', eff:{talent:1,eq:1}, tags:['freelance'], outfit:'casual' }
  ]},
{ id:'y_startup', min:26, max:30, era:'modern',
  text:'一个老朋友找到你，说有个创业点子，万事俱备，只缺一个你。',
  options:[
    { t:'梭哈！趁年轻搏一把', say:'{startupResult}', eff:{}, tags:['try_startup'], cond:{ minWealth:4 } },
    { t:'婉拒，先积累本金和人脉', say:'你继续稳扎稳打。后来那家公司{startupAfter}。', eff:{iq:1}, tags:['steady'] }
  ]},
{ id:'y_switch', min:26, max:31, era:'modern',
  text:'工作几年，你发现自己对现在的行业提不起劲。跨行意味着从零开始。',
  options:[
    { t:'跨专业转行，从心出发', say:'你用半年下班时间自学新技能，成功跳槽。工资降了一截，眼睛亮了回来。', eff:{talent:2,wealth:-1}, tags:['switcher'] },
    { t:'深耕本行，做专家', say:'你把冷板凳坐热，成了组里离不了的那个人。', eff:{iq:1,wealth:1}, tags:['expert'] }
  ]},
{ id:'y_abroad_back', min:25, max:29, era:'modern', cond:{ tag:'overseas' },
  text:'海外几年，留下有留下的体面，回来有回来的牵挂。',
  options:[
    { t:'留在海外发展', say:'你拿到了工作签证。牛排管够，但梦里常出现家门口的豆浆油条。', eff:{wealth:2}, tags:['settled_abroad'] },
    { t:'回国，把学的用上', say:'飞机落地的那一刻，你拖着行李箱深吸了一口气——还是这个味儿。', eff:{eq:1,wealth:1}, tags:['returnee'] }
  ]},
{ id:'y_house', min:27, max:33, era:'modern',
  text:'身边的同龄人陆续买了房。中介的电话一天三个，房价一天一个样。',
  options:[
    { t:'揝空六个钱包，上车', say:'钥匙到手那晚，你在空荡荡的毛坯房里坐了两个小时，又哭又笑。', eff:{wealth:-3,power:1}, tags:['house'], cond:{ minWealth:6 } },
    { t:'不背三十年房贷，租房理财', say:'你把首付钱做了稳健投资。账面在涨，房东也在涨租。', eff:{wealth:1}, tags:['renter'] }
  ]},
{ id:'y_car', min:25, max:30, era:'modern',
  text:'驾照在抽屉里躺了几年，4S店销售的朋友圈天天刷屏。',
  options:[
    { t:'买！人生需要一脚油门', say:'提车第一周，你绕城开了三圈。自由的形状，是四个轮子。', eff:{wealth:-2,eq:1}, tags:['car'], cond:{ minWealth:5 } },
    { t:'公共交通挺好，攒钱要紧', say:'你把购车款存进了理财。地铁上读完的书，比别人一年都多。', eff:{wealth:1,iq:1}, tags:['frugal'] }
  ]},
{ id:'y_marry', min:26, max:32, era:'any',
  text:'婚姻大事提上日程。家里人旁敲侧击，朋友的请柬一张接一张。',
  options:[
    { t:'与心上人成婚', say:'婚礼不奢华，但交换戒指时你们的手都在抖。', eff:{eq:2}, tags:['married'], cond:{ anytag:['first_love'] } },
    { t:'相亲，条件合适就过', say:'你们像谈项目一样谈了半年，然后把证领了。日子细水长流。', eff:{eq:1}, tags:['married'] },
    { t:'单身万岁，专注自己', say:'你把婚礼预算花在了自己身上：一趟远行，一门新课。', eff:{talent:1,wealth:1}, tags:['single_mind'] }
  ]},
{ id:'y_baby', min:27, max:34, era:'any', cond:{ tag:'married' },
  text:'关于孩子，你们认真地谈了一次又一次。',
  options:[
    { t:'迎接新生命', say:'凌晨三点的啼哭声里，你抱着那个小小的、软软的生命，突然懂了父亲当年的眼神。', eff:{eq:1,wealth:-1}, tags:['parent'] },
    { t:'丁克/暂缓，二人世界先过好', say:'你们把养娃的钱和时间，投资给了彼此和热爱。', eff:{wealth:1,eq:1}, tags:['dink'] }
  ]},
{ id:'y_official_path', min:24, max:30, era:'ancient', cond:{ anytag:['exam_ready','ru_scholar'] },
  text:'放榜之日，你挤在人群里，一眼就看到了自己的名字——{rankText}！',
  options:[
    { t:'入仕为官，清正立身', say:'你换上了官服。案牍劳形，但你守住了一条线：不拿百姓一文钱。', eff:{power:2,eq:-1}, tags:['official','honest'], outfit:'official' },
    { t:'入仕为官，灵活处世', say:'你深谙衙门里的规矩，上下打点，升迁比同僚都快。', eff:{power:3,eq:1}, tags:['official','worldly'], outfit:'official' },
    { t:'辞官不做，回乡教书', say:'你看惯了朱门酒肉，决定回乡开馆授徒。学生盈门，心里踏实。', eff:{iq:1,eq:2}, tags:['teacher'], outfit:'scholar' }
  ]},
{ id:'y_wuxia_path', min:24, max:29, era:'ancient', cond:{ tag:'wuxia' },
  text:'江湖上渐渐有了你的名号。有人请你押镖，有人邀你结义，也有人下了战书。',
  options:[
    { t:'行侠仗义，快意恩仇', say:'你劫了恶霸的粮仓分给灾民。官府通缉令上，多了你的画像。', eff:{eq:2,power:-1}, tags:['knight'] },
    { t:'开镖局，把武功变营生', say:'你的镖旗插到哪里，哪里的山贼就给三分薄面。', eff:{wealth:2}, tags:['biaoju'], outfit:'silk' },
    { t:'归隐山林，不问世事', say:'你在山脚搭了间茅屋，日出练剑，日落煮茶。', eff:{body:1,eq:1}, tags:['hermit'], outfit:'cloth' }
  ]},
{ id:'y_medic_path', min:24, max:29, era:'any', cond:{ anytag:['medic_path','herb','major_medic'] },
  text:'多年苦学，你终于可以独当一面、坐诊行医了。',
  options:[
    { t:'开馆/入职，悬壶济世', say:'第一位病人康复登门道谢时，你比他还激动。', eff:{talent:1,eq:1}, tags:['doctor'], outfit:'medic' },
    { t:'兼营药铺，医商两济', say:'你的药铺童叟无欺，回头客越来越多。', eff:{wealth:2}, tags:['doctor','merchant_path'], outfit:'medic' }
  ]},
{ id:'y_merchant_path', min:25, max:31, era:'ancient', cond:{ anytag:['merchant_path','abacus','inherit'] },
  text:'攒下第一桶金后，是把生意做大，还是守成过安稳日子？',
  options:[
    { t:'开分号，把招牌打出去', say:'三年间你的铺子开了三家分号。账房先生拨算盘的声音，是最动听的音乐。', eff:{wealth:3,eq:1}, tags:['tycoon'], outfit:'silk' },
    { t:'守成，稳扎稳打', say:'你不贪大。一间铺子，养活三代人，街坊都认你的招牌。', eff:{wealth:1,eq:1}, tags:['steady_biz'] }
  ]},
{ id:'y_keju_pass', min:25, max:31, era:'ancient', cond:{ tag:'exam_ready' },
  text:'又是三年一场的大比。这一次，你的文章被主考官圈了又圈。',
  options:[
    { t:'殿试夺魁，一步登天', say:'金殿对策，你对答如流。圣上朱笔一点，你的名字传遍州府。', eff:{power:3,iq:1}, tags:['official'], outfit:'official', cond:{ minIq:8 } },
    { t:'外放做官，实惠于民', say:'你领了个知县的缺，带着家眷上任去了。治河、劝农、办学，样样亲力亲为。', eff:{power:2,eq:1}, tags:['official'], outfit:'official' },
    { t:'功名到手即收，回乡经营', say:'你把功名牌匾挂上祠堂，转身修了三条路、两座桥。', eff:{eq:2,wealth:1}, tags:['squire'] }
  ]},
{ id:'y_gong_again', min:27, max:31, era:'modern', cond:{ tag:'try_gong', notag:'official_pass' },
  text:'去年差了两分。今年你把「上岸」两个字贴在了书桌前。',
  options:[
    { t:'脱产再战一年', say:'这一年你推掉了所有饭局。放榜那天，你终于笑出了声。', eff:{iq:1,wealth:-1}, tags:['official_pass'] },
    { t:'边打工边考，曲线救国', say:'你在奶茶店打工间隙刷题。第三年，你进了面试考场。', eff:{iq:1,body:-1,wealth:1}, tags:['official_pass'] },
    { t:'放弃执念，另寻天地', say:'你把行测题册送给了表弟。解脱的那一刻，天下都是你的。', eff:{eq:1,talent:1}, tags:['freelance'], outfit:'casual' }
  ]},
{ id:'y_side_hustle', min:26, max:32, era:'modern',
  text:'下班后的时间，你琢磨着搞点副业。有人劝你写作，有人劝你拍视频。',
  options:[
    { t:'写作投稿，笔耕不辍', say:'第一笔稿费只有八十八块，但你把汇款单裱了起来。', eff:{talent:1,iq:1}, tags:['writing'] },
    { t:'拍视频记录生活', say:'第五十条视频终于爆款。评论区里，你成了「人间观察员」。', eff:{talent:2,eq:1}, tags:['creator'] },
    { t:'周末摆摊，烟火谋生', say:'你的小摊从月入三百涨到月入三千。风吹日晒，自得其乐。', eff:{wealth:1,body:1}, tags:['stall'] },
    { t:'正经人搞什么副业', say:'你把时间投资给了主业和专业证书。后来它们都派上了用场。', eff:{iq:1,wealth:1}, tags:['expert'] }
  ]},
{ id:'y_ming_press', min:25, max:31, era:'minguo', cond:{ anytag:['new_school','writing'] },
  text:'报馆主笔递给你一支钢笔：「这块阵地，往后有你一版。」',
  options:[
    { t:'铁肩担道义，妙手著文章', say:'你的评论一篇比一篇锋利。读者爱读，也上了某些人的黑名单。', eff:{eq:1,power:1}, tags:['press','brave'] },
    { t:'写风花雪月，安稳度日', say:'你的连载小说成了报纸的销量担当。乱世里，笑声也是功德。', eff:{wealth:2,talent:1}, tags:['press'] },
    { t:'辞职办自己的刊物', say:'油印机吱呀作响，你们几个年轻人把理想印在了纸上。', eff:{wealth:-1,eq:1,talent:1}, tags:['press','startup_mind'] }
  ]},
{ id:'y_ancient_school', min:25, max:32, era:'ancient', cond:{ anytag:['ru_scholar','teacher','studious'] },
  text:'乡里请你开馆授徒。束脩不多，但乡邻的目光热切。',
  options:[
    { t:'开馆授徒，有教无类', say:'你立了规矩：穷家孩子免一半。三十年后，你的学生遍及州府。', eff:{eq:2,iq:1}, tags:['teacher'], outfit:'scholar' },
    { t:'只收富家子弟，多攒束脩', say:'你挑了十二个学生，都是殷实人家。银钱厚了，名声淡了。', eff:{wealth:2,eq:-1}, tags:['teacher'] }
  ]},
{ id:'y_merchant_wife', min:25, max:31, era:'ancient', cond:{ gender:'女', tag:'merchant_path' },
  text:'夫家/自家铺子的账房出了纰漏，掌柜的愁得直转圈。你在旁边拨了两下算盘。',
  options:[
    { t:'接过账房，当家主事', say:'你理清了三年的烂账。从此铺子里的人见了你，都恭恭敬敬称一声「东家」。', eff:{wealth:2,power:1}, tags:['tycoon'] },
    { t:'出谋划策，隐在幕后', say:'你把法子写在纸条上递出去。生意好了，没人知道纸条是谁写的。', eff:{iq:1,eq:1}, tags:['steady_biz'] },
    { t:'添妆入股，自立门户', say:'你用嫁妆盘下临街的小铺，卖起了自己绣的帕子。', eff:{wealth:1,talent:1}, tags:['tycoon'], outfit:'silk' }
  ]},
{ id:'y_ancient_journey', min:25, max:32, era:'ancient',
  text:'同乡邀你结伴远游：登泰山、下江南、走蜀道。行囊很简单，勇气也是。',
  options:[
    { t:'仗剑远游，壮行万里', say:'你在剑门关的栈道上腿软过，在黄鹤楼顶也豪迈过。山河装进了胸膛。', eff:{eq:2,body:1}, tags:['traveler'] },
    { t:'家业为重，远方寄回明信片', say:'你留在铺子/田里。同乡寄回的信，你读给全家人听。', eff:{wealth:1}, tags:['homebody'] }
  ]},
{ id:'y_army_path', min:25, max:32, era:'any', cond:{ tag:'army' },
  text:'军中比武，你拔了头筹。将军拍着你的肩：「愿不愿领一哨人马？」',
  options:[
    { t:'接印！在军中闯出名号', say:'你治军严明，赏罚分明。兵士背后叫你「铁面」，叫得心服口服。', eff:{power:2,body:1,eq:-1}, tags:['general'] },
    { t:'功成身退，解甲归田', say:'你把军功章包进包袱底。回乡那年，麦子长得格外好。', eff:{eq:1,body:1,wealth:1}, tags:['hermit'], outfit:'cloth' }
  ]},
{ id:'y_marry_late', min:28, max:34, era:'any', cond:{ notag:'married' },
  text:'同龄人的孩子都打酱油了。你妈把「再不结婚就老了」这句话说出了包浆。',
  options:[
    { t:'认真相亲，遇到合适的就定', say:'第七次相亲，你们聊了三个小时没看手机。缘分这东西，迟但到。', eff:{eq:2}, tags:['married'] },
    { t:'一个人也把日子过成诗', say:'你的独居小屋收拾得一尘不染。周末的煎饼摊主都认得你了。', eff:{talent:1,body:1}, tags:['single_mind'] },
    { t:'和好友约定搭伴养老', say:'你们签了「互助养老协议」，逗笑了半个朋友圈。多年后，这条约定救了两个人。', eff:{eq:1}, tags:['pact'] }
  ]},
{ id:'y_first_fortune', min:26, max:33, era:'modern', cond:{ minWealth:6 },
  text:'卡里第一次有了六位数。你在银行门口站了一会儿，不知道先给谁打电话。',
  options:[
    { t:'给爸妈换台新电器，报喜不报忧', say:'母亲嘴上埋怨你乱花钱，转头就把新电视给全楼邻居展示了一遍。', eff:{eq:2}, tags:['filial'] },
    { t:'投资自己：课程/证书/设备', say:'你把这些钱变成了简历上的三行字。后来每行都升值了。', eff:{iq:2}, tags:['expert'] },
    { t:'存起来，让钱生钱', say:'你研究了三个月理财，做了张表格。本金 Safely 长胖了。', eff:{wealth:2}, tags:['stable_invest'] }
  ]},
{ id:'y_health_check', min:27, max:33, era:'modern', cond:{ tag:'whitecollar' },
  text:'体检报告出来了：脂肪肝、颈椎变直、心律不齐。医生推了推眼镜：「三十岁，六十岁的脖子。」',
  options:[
    { t:'痛改前非：健身+早睡', say:'三个月后你瘦了八斤，爬五楼不喘了。同事问你怎么容光焕发，你把私教课推给了他。', eff:{body:2,wealth:-1}, tags:['wellness'] },
    { t:'买护肝片续命，照旧熬夜', say:'保温杯里泡枸杞，酒吧里面泡自己。账，身体迟早要跟你算。', eff:{body:-2,eq:1}, tags:['ill_tough'] },
    { t:'换个工作，命比钱重要', say:'你辞了活儿最重的岗位。工资少了两成，头发多了回来。', eff:{body:1,wealth:-1}, tags:['gap'] }
  ]},
{ id:'y_ming_move', min:25, max:31, era:'minguo',
  text:'同乡说南边的埠口工钱高三成，也有人劝你北上，说那里「天天有新事」。',
  options:[
    { t:'南下进商埠，闯出一条路', say:'码头的号子、洋行的算盘、街头的霓虹，你见了世面，也吃了苦头。', eff:{wealth:2,eq:1}, tags:['city_boy'] },
    { t:'北上求学做工，见新气象', say:'你在北平的胡同里住下，白天做工，夜里去听公开课。', eff:{iq:2,wealth:-1}, tags:['new_school'] },
    { t:'守着家乡，乱世求安稳', say:'你把老宅修了修，日子清苦但踏实。外面的风浪，隔着报纸听。', eff:{body:1}, tags:['homebody'] }
  ]},
{ id:'y_craft_fame', min:26, max:34, era:'any', cond:{ anytag:['craft','carpenter','needle'], minTalent:6 },
  text:'你的一件手作被行家看中了，说要带去府城参展/荐给大主顾。',
  options:[
    { t:'精进手艺，打出名号', say:'你带着作品走了一遭，回来时铺子的门槛都快被踩平了。', eff:{talent:2,wealth:1}, tags:['craft_master'] },
    { t:'开班收徒，把手艺传下去', say:'你收了八个徒弟，个个都得了你的真传。', eff:{eq:2}, tags:['mentor'] },
    { t:'守着自己的小日子就好', say:'你婉拒了。手艺是自己的心，不掺外面的热闹。', eff:{eq:1,body:1}, tags:['hermit'] }
  ]},
{ id:'y_girl_bigcity', min:27, max:33, era:'modern', cond:{ gender:'女' },
  text:'母亲在电话里第无数次提起「隔壁小王的女儿回县城了，考了编，多好」。',
  options:[
    { t:'坚持留在大城市打拼', say:'你搬了三次家，换了两次工作，也终于活成了自己想要的模样。', eff:{iq:1,wealth:1}, tags:['city_boy','resilient'] },
    { t:'回县城考编，离家近', say:'你考上了。单位的姐姐们热心地给你介绍对象，你逃了一半，赴了一半。', eff:{eq:1,body:1}, tags:['official_pass'] },
    { t:'折中：去省城，每周回家', say:'高铁四十分钟。你找到了自己的答案：不必非此即彼。', eff:{eq:1,wealth:1}, tags:['adaptive'] }
  ]},

/* ================================================================
   抉择事件库 · 中年（35-44）18 条
================================================================ */
{ id:'m_ceiling', min:35, max:38, era:'any',
  text:'三十五岁上下，职业的玻璃天花板隐隐可见。往前一步难，原地不动又不甘。',
  options:[
    { t:'搏一次晋升/转型', say:'你主动请缨扛下最难的项目，熬了半年，位置上了半级。', eff:{power:1,iq:1,body:-1}, tags:['climber'] },
    { t:'接受平凡，把日子过扎实', say:'你把更多时间分给了家人和自己。工资没变，笑容多了。', eff:{eq:2}, tags:['content'] }
  ]},
{ id:'m_layoff', min:36, max:42, era:'modern',
  text:'行业寒冬，裁员名单里有你的名字。HR谈话只用了十分钟。',
  options:[
    { t:'降薪再就业，先上车再说', say:'你放下面子重新开始。新工位小了些，但你把它收拾得干净利落。', eff:{wealth:-1,eq:1}, tags:['rebound'] },
    { t:'开滴滴/送外卖过渡，蟄伏待机', say:'方向盘握了一年，你听了上千个乘客的故事，也想清了自己的路。', eff:{body:-1,talent:1}, tags:['gig'] },
    { t:'摆摊/小买卖，自谋生路', say:'你的小摊从一天卖三十块做到三百块。烟火气里，你重新站稳了。', eff:{wealth:1,talent:1}, tags:['stall'], cond:{ minWealth:3 } }
  ]},
{ id:'m_quit', min:37, max:42, era:'any',
  text:'某个加班/操劳的深夜，你突然问自己：这样的日子，还要过多久？',
  options:[
    { t:'辞职/歇业一年，给自己放个假', say:'你去了趟远方，读完了一直想读的书。回来时，眼睛里的光回来了。', eff:{body:1,eq:1,wealth:-2}, tags:['gap'], cond:{ minWealth:4 } },
    { t:'咬牙坚持，上有老下有小', say:'你把辞职信删了。第二天照常起床、挤车、干活。成年人的世界没有容易二字。', eff:{wealth:1,body:-1}, tags:['grinder'] }
  ]},
{ id:'m_illness', min:36, max:44, era:'any',
  text:'体检/问诊结果不太好——一场不大不小的病，医生/郎中建议尽快系统治疗。',
  options:[
    { t:'全力救治，钱没了再挣', say:'治疗很苦，但你扛了过来。出院那天阳光正好。', eff:{wealth:-3,body:1}, tags:['survivor'], cond:{ minWealth:4 }, cure:true },
    { t:'保守治疗，能扛就扛', say:'你一边调理一边硬撑。身体在走钢丝，钱包保住了。', eff:{wealth:-1,body:-1}, tags:['ill_tough'], halftreat:true },
    { t:'不信邪，偏方养生', say:'艾灸、偏方、保健品试了一圈，病情时好时坏。', eff:{wealth:-1,body:-2}, tags:['ill_tough'], notreat:true }
  ]},
{ id:'m_kid_edu', min:37, max:43, era:'modern', cond:{ tag:'parent' },
  text:'孩子上学了。家长群里，有人晒奥数奖，有人晒钢琴十级。',
  options:[
    { t:'鸡娃——不能输在起跑线', say:'周末排满五个班。孩子的奖状贴了一墙，笑容少了一半。', eff:{wealth:-2,power:1}, tags:['tiger_parent'] },
    { t:'快乐教育——童年只有一次', say:'你陪他捉泥鳅、看星星。他的成绩中等，眼里的光满分。', eff:{eq:2}, tags:['zen_parent'] }
  ]},
{ id:'m_parents', min:38, max:44, era:'any',
  text:'父母老了。一通电话打来，说父亲/母亲病倒了。',
  options:[
    { t:'放下工作，回家贴身照顾', say:'你在病床前端水喂药三个月。父亲/母亲拉着你的手说：「拖累你了。」你摇头，一句话都说不出。', eff:{eq:2,wealth:-1}, tags:['filial'] },
    { t:'请最好的护工/郎中，钱到位', say:'你出钱，专业的人出力。每周的视频电话里，老人气色尚可。', eff:{wealth:-2}, tags:['filial_money'], cond:{ minWealth:5 } },
    { t:'忙，只能逢年过节回去看看', say:'你说服自己「没办法」。挂掉电话后，盯着天花板到天亮。', eff:{eq:-2}, tags:['regret'] }
  ]},
{ id:'m_hobby', min:38, max:44, era:'any',
  text:'人到中年，你决定重新捡起一个「没用的」爱好。',
  options:[
    { t:'书法/古琴——静心', say:'一笔一画，一弦一柱。柴米油盐之外，你有了自己的桃花源。', eff:{talent:1,eq:1}, tags:['hobby_art','art'] },
    { t:'跑马/健身——强身', say:'从三公里喘成狗到完赛半马，你把中年跑成了少年。', eff:{body:2}, tags:['runner'] },
    { t:'钓鱼/种花——养性', say:'河边一坐一整天。别人笑你空军，你笑别人不懂。', eff:{body:1,eq:1}, tags:['fisher'] },
    { t:'搞钱就是最大的爱好', say:'你把业余时间都用来研究副业。银行卡余额是最好的安慰剂。', eff:{wealth:2}, tags:['hustler'] }
  ]},
{ id:'m_marriage_crisis', min:38, max:44, era:'any', cond:{ tag:'married' },
  text:'结婚多年，激情褪去，争吵渐多。有天对方平静地说：「我们是不是出问题了？」',
  options:[
    { t:'好好谈，一起做婚姻咨询/深谈', say:'你们把多年的委屈摊开在桌上，哭了一场，然后决定继续牵着手走。', eff:{eq:2}, tags:['marriage_saved'] },
    { t:'和平分开，各自安好', say:'签字那天很平静。出门时你们互相说了句「保重」。', eff:{eq:-1,wealth:-1}, tags:['divorced'] },
    { t:'凑合过吧，还能离咋地', say:'你们成了同一屋檐下的室友。饭照做，话少说。', eff:{body:-1}, tags:['numb_marriage'] }
  ]},
{ id:'m_invest', min:38, max:44, era:'any',
  text:'手里攒了些钱。有人劝你稳健理财，有人拉你搞票大的。',
  options:[
    { t:'稳健理财，睡个安稳觉', say:'收益不多，但每个晚上都睡得着。', eff:{wealth:1}, tags:['stable_invest'] },
    { t:'激进一把，富贵险中求', say:'{investResult}', eff:{}, tags:['risky_invest'], cond:{ minWealth:5 } }
  ]},
{ id:'m_layoff2', min:40, max:44, era:'modern', cond:{ notag:'rebound' },
  text:'公司整编，你的岗位又没了。这次你四十二岁，简历投出去石沉大海。',
  options:[
    { t:'考个证，转行做顾问/讲师', say:'你把二十年的经验熬成了一门课。第一堂课，台下坐了四十个年轻人。', eff:{iq:1,eq:1}, tags:['mentor','rebound'] },
    { t:'开个小店，从此为自己打工', say:'你的面馆开在学校后街。学生喊你「老板」，你喊他们「慢点吃」。', eff:{wealth:1,eq:1,body:-1}, tags:['stall'] },
    { t:'送外卖/开网约车，撑住家', say:'系统派单的声音，成了你后半场人生的背景音。孩子学费没断过。', eff:{wealth:1,body:-2}, tags:['gig','hardship'] }
  ]},
{ id:'m_famine_relieve', min:36, max:44, era:'ancient', cond:{ minWealth:5 },
  text:'邻县大灾，流民过境。县尊号召富户捐粮，你家粮仓正满。',
  options:[
    { t:'开仓赈济，设粥棚十里', say:'那个冬天，你的粥棚救活了三百多人。流民临走时，朝你家方向磕了三个头。', eff:{wealth:-2,eq:2}, tags:['philanthropist'] },
    { t:'捐一半，留一半', say:'你捐了三十石粮，留了过冬的底。乡里说你厚道，你自家夜里睡得着。', eff:{wealth:-1,eq:1}, tags:['kind'] },
    { t:'高筑墙，闭门户', say:'你护住了自家。多年后路过城外的乱葬岗，你放慢了脚步。', eff:{wealth:1,eq:-2}, tags:['cold'] }
  ]},
{ id:'m_war_refuge', min:36, max:46, era:'ancient',
  text:'北边打起来了。溃兵过境的消息一天三变，村里人收拾细软准备南逃。',
  options:[
    { t:'举家南迁，保命要紧', say:'你带着全家走了两个月。到了南方，你重新搭屋、开荒、从头来过。', eff:{wealth:-2,body:-1,eq:1}, tags:['refugee','resilient'] },
    { t:'组织乡勇，护乡守土', say:'你带着后生们守了三个昼夜。贼兵没进村，你肩上多了道疤。', eff:{power:1,body:-1,eq:2}, tags:['militia','brave'] },
    { t:'投军报国，以战止战', say:'你再次披甲。这一次，你的名字在军中已是「老」字号。', eff:{body:-1,power:2}, tags:['general'] }
  ]},
{ id:'m_ming_war', min:36, max:44, era:'minguo',
  text:'炮声隐隐，时局急转直下。报上说北边已经打起来了。',
  options:[
    { t:'举家西迁，去大后方', say:'你带着全家挤上西行的列车。一路上，你把《滕王阁序》背给孩子们听。', eff:{wealth:-2,eq:1,body:-1}, tags:['refugee'] },
    { t:'留下守护家业铺子', say:'你在门板上钉了「平民」二字。铺子保住了大半，人心也稳了。', eff:{wealth:-1,eq:1,power:1}, tags:['steady_biz'] },
    { t:'送子从军/自己投军', say:'站台上你没哭。回家的路上，你走了很久很久。', eff:{eq:-1,power:1}, tags:['army','brave'] }
  ]},
{ id:'m_kid_exam', min:38, max:43, era:'modern', cond:{ tag:'parent' },
  text:'孩子高考/升学在即，成绩在重点线上下摇摆。他自己的态度倒成了关键。',
  options:[
    { t:'尊重他的选择，做好后勤', say:'你说：「路是你自己的。」他后来常说，那句话让他真正长大了。', eff:{eq:2}, tags:['zen_parent'] },
    { t:'请最好的老师，全力一搏', say:'你请了三个家教。分数上去了，孩子的眼镜也厚了。', eff:{wealth:-2,power:1}, tags:['tiger_parent'] },
    { t:'建议他学一门手艺早点自立', say:'他学了烹饪/汽修。如今他的店开了分店，逢年过节都来看你。', eff:{eq:1,talent:1}, tags:['vocational_parent'] }
  ]},
{ id:'m_sib_help', min:37, max:44, era:'any',
  text:'兄弟/姐妹生意失败，上门借钱。数目不小，他的眼圈是红的。',
  options:[
    { t:'倾力相助，不计回报', say:'你把存折推了过去。他说「算我借的」，你说「先拿去用」。', eff:{wealth:-2,eq:2}, tags:['kind'] },
    { t:'借一部分，约法三章', say:'你借了三成，写了字据。钱后来还清了，情分也没伤。', eff:{wealth:-1}, tags:['cautious'] },
    { t:'婉拒：各家有各家的难处', say:'他走了。那年的年夜饭，桌上少了一双筷子。', eff:{wealth:1,eq:-2}, tags:['cold'] }
  ]},
{ id:'m_career_gamble', min:38, max:44, era:'modern', cond:{ minWealth:5 },
  text:'你看准了一个机会：辞职创业，赢了会所嫩模，输了下海干活。',
  options:[
    { t:'破釜沉舟，全力一搏', say:'{midStartupResult}', eff:{}, tags:['try_startup'] },
    { t:'保留工作，业余试水', say:'你用两年时间验证了模式。真辞职时，账上已经有三个客户了。', eff:{iq:1,wealth:1}, tags:['startup_mind','steady'] },
    { t:'认清自己不是干这个的料', say:'你把商业计划书锁进抽屉。梦想没有死，只是换了件衣裳。', eff:{eq:1}, tags:['content'] }
  ]},
{ id:'m_stroke_warn', min:40, max:44, era:'any',
  text:'那阵子你总头晕，右手偶尔发麻。郎中/医生把脉后沉声道：「再不调养，要出大事。」',
  options:[
    { t:'彻底改变：戒熬夜、练养生功', say:'你把烟酒都戒了，每天走一万步。家人说，你像变了个人。', eff:{body:2,wealth:-1}, tags:['wellness'] },
    { t:'吃药控制，习惯照旧', say:'药按时吃着，夜照旧熬着。身体没爆雷，但利息一直在滚。', eff:{body:-1,wealth:-1}, tags:['ill_tough'] },
    { t:'不当回事，扛过去再说', say:'直到某个清晨，你半边身子不听使唤。家人把你抬上车的手，抖得厉害。', eff:{body:-3}, tags:['ill_tough'], notreat:true }
  ]},
{ id:'m_take_apprentice', min:38, max:46, era:'any', cond:{ minTalent:6 },
  text:'一个后生登门求艺，说愿意端茶递水伺候三年。你想起当年的自己。',
  options:[
    { t:'收下，倾囊相授', say:'你把看家本事拆成三百六十招，一招一招喂给他。', eff:{eq:2}, tags:['mentor'] },
    { t:'留一手，教会徒弟饿死师傅', say:'他学了个七成，也学会了留一手。手艺，就这么越传越薄。', eff:{eq:-1}, tags:[] },
    { t:'收徒但立严规：先做人后学艺', say:'你立了三条门规。多年后，你的门风成了行里的标杆。', eff:{eq:1,power:1}, tags:['mentor'] }
  ]},

/* ================================================================
   抉择事件库 · 后半生（45+）14 条
================================================================ */
{ id:'l_second', min:45, max:50, era:'any',
  text:'半生已过。有人劝你含饴弄孙享清福，你却觉得心里还有团火。',
  options:[
    { t:'著书立说/带徒弟，把本事传下去', say:'你把半生心得一字字写下/一句句教给年轻人。传承，是另一种长生。', eff:{iq:1,eq:1}, tags:['mentor'] },
    { t:'退居二线，把时间还给自己', say:'你从核心位置退下来。茶喝透了，棋下慢了，觉睡足了。', eff:{body:1,eq:1}, tags:['retired_soft'] }
  ]},
{ id:'l_travel', min:46, max:55, era:'any',
  text:'世界那么大，年轻时没空看的风景，现在想去看看了。',
  options:[
    { t:'出发！名山大川/环球旅行', say:'你站在年轻时梦想的风景里，拍了一张笑得很傻的照片。', eff:{eq:1,body:1,wealth:-2}, tags:['wanderer'], cond:{ minWealth:5 } },
    { t:'近郊走走就好，省钱', say:'城市的公园被你走了个遍。你发现最美的风景其实不要门票。', eff:{body:1}, tags:['local_walker'] }
  ]},
{ id:'l_charity', min:47, max:56, era:'any',
  text:'攒下些家业后，乡里/社区有人提议为修桥铺路/助学募些钱。',
  options:[
    { t:'慷慨解囊，留名不如留心', say:'桥成那天/助学金发出去那天，你没去剪彩。但心里有座碑。', eff:{wealth:-2,eq:2}, tags:['philanthropist'], cond:{ minWealth:5 } },
    { t:'量力而行，出份心意', say:'你捐了一份体面的心意。善意不论大小。', eff:{wealth:-1,eq:1}, tags:['kind'] }
  ]},
{ id:'l_health', min:48, max:58, era:'any',
  text:'体检报告上的箭头越来越多，老伙计们聊天的话题不知不觉都变成了养生。',
  options:[
    { t:'认真养生：规律作息+坚持锻炼', say:'晨起打拳，晚饭后散步。指标一年比一年好看。', eff:{body:2}, tags:['wellness'] },
    { t:'该吃吃该喝喝，开心最重要', say:'你拒绝被体检报告绑架。快乐是良药——至少你这么说。', eff:{eq:1,body:-1}, tags:['carpe_diem'] }
  ]},
{ id:'l_grandkid', min:50, max:62, era:'any', cond:{ tag:'parent' },
  text:'子女也有了自己的孩子。小孙辈奶声奶气地喊你，心都化了。',
  options:[
    { t:'含饴弄孙，享受天伦', say:'你成了孩子王。背上的小家伙哈哈笑的时候，你觉得这辈子值了。', eff:{eq:2}, tags:['grandparent'] },
    { t:'帮忙但保持距离，过好自己', say:'周末探望，平时广场舞/老友局。边界感让两代人都舒服。', eff:{eq:1,body:1}, tags:['cool_elder'] }
  ]},
{ id:'l_legacy', min:55, max:70, era:'any',
  text:'夜深人静时，你开始想一个从前不愿想的问题：这一生，留下些什么？',
  options:[
    { t:'把家业/手艺郑重传给后辈', say:'交接那天，你把多年的心得写了满满十页纸。薪火相传。', eff:{eq:1}, tags:['legacy'], cond:{ anytag:['tycoon','carpenter','doctor','house','official','inherit'] } },
    { t:'立好遗嘱，把身后事安排妥当', say:'你平静地安排好一切。从容，是岁月给的底气。', eff:{iq:1}, tags:['prepared'] },
    { t:'捐出大部分积蓄/藏书/作品', say:'你说：生不带来，死不带去。让它们去更有用的地方。', eff:{wealth:-2,eq:2}, tags:['philanthropist'], cond:{ minWealth:4 } }
  ]},
{ id:'l_oldhome', min:60, max:75, era:'any',
  text:'住哪儿养老，成了要认真考虑的事。',
  options:[
    { t:'与子女同住，热热闹闹', say:'三代同堂，饭菜香里混着孙辈的笑闹声。', eff:{eq:1}, tags:['family_elder'], cond:{ tag:'parent' } },
    { t:'老宅独居，自在清净', say:'一方小院，几盆花草，一只老猫。清净是你想要的高级。', eff:{body:1}, tags:['solo_elder'] },
    { t:'老友抱团/养老社区，有伴儿', say:'下棋、合唱、晒太阳。老伙计们在一起，皱纹里都透着乐呵。', eff:{eq:2,wealth:-1}, tags:['community_elder'], cond:{ minWealth:4 } }
  ]},
{ id:'l_memoir', min:48, max:58, era:'any', cond:{ minIq:5 },
  text:'孙辈/学生缠着你讲从前的事。讲着讲着，你想把它们写下来。',
  options:[
    { t:'写回忆录，一页一页写', say:'你写了整整两年。扉页上只有一句：给走过同一条路的人。', eff:{iq:1,eq:1}, tags:['writing'] },
    { t:'口述给晚辈录音', say:'录音笔存了四十个小时。你讲到父亲那年，停了很久。', eff:{eq:1}, tags:['story_lover'] },
    { t:'往事随风，不提也罢', say:'你说：「往前看就好。」可那晚的梦，比平时长了一些。', eff:{}, tags:[] }
  ]},
{ id:'l_reunion', min:46, max:60, era:'any',
  text:'同学/同窗聚会。当年最闹的胖了，最静的健谈了，还有人没能来。',
  options:[
    { t:'挨桌敬酒，笑谈当年', say:'你们把当年的粀事讲了一整晚，笑出的眼泪比酒还多。', eff:{eq:2,body:-1}, tags:['social'] },
    { t:'和两三个老友单独坐了坐', say:'你们聊得很少，喝得很慢。有些默契，不需要话多。', eff:{eq:1}, tags:[] },
    { t:'没去。有些青春，留在原地就好', say:'你在阳台坐了一晚，把老照片翻了一遍又一遍。', eff:{eq:-1,talent:1}, tags:['nostalgic'] }
  ]},
{ id:'l_retire_office', min:50, max:60, era:'ancient', cond:{ tag:'official' },
  text:'致仕的折子/告老的文书递了上去。数十载宦海，终于可以上岸了。',
  options:[
    { t:'告老还乡，两袖清风', say:'你的行李只有书箱和一床旧被。乡人夹道相迎，你在村口下了马，步行进村。', eff:{eq:2,body:1}, tags:['honest','squire'] },
    { t:'留京/留任辅政，再尽余热', say:'你以老臣之身参赞机务。庙堂之高，你站到了最后一班岗。', eff:{power:1,body:-1}, tags:['general'] },
    { t:'游历天下，读山读水', say:'你把官轿换成了驴车，走遍了两京十三省。', eff:{eq:1,talent:1}, tags:['wanderer'] }
  ]},
{ id:'l_garden', min:48, max:65, era:'modern',
  text:'你在阳台/小院里腾出一块地。种点什么好呢？',
  options:[
    { t:'种菜，自给自足一小角', say:'第一根黄瓜结出来那天，你拍照发了三个群。', eff:{body:1,eq:1}, tags:['fisher'] },
    { t:'养花，把四季搬回家', say:'你的月季在小区花展上拿了个三等奖。奖状不大，欢喜很大。', eff:{eq:1,talent:1}, tags:['hobby_art'] },
    { t:'什么也不种，晒太阳就好', say:'一把藤椅一壶茶。你终于允许自己什么都不干。', eff:{body:1}, tags:['retired_soft'] }
  ]},
{ id:'l_smartphone', min:50, max:70, era:'modern',
  text:'孙辈教你用智能手机：视频通话、移动支付、网上挂号。屏幕里的世界很陌生。',
  options:[
    { t:'认真学习，跟上时代', say:'三个月后你会网购、会挂号、会发短视频。你给自己取的网名叫「不服老」。', eff:{iq:1,eq:1}, tags:['adaptive'] },
    { t:'只学视频通话，够用就好', say:'每周日晚上八点，你和儿孙的视频准时接通。这就够了。', eff:{eq:1}, tags:['dutiful'] },
    { t:'学不会，也不用学', say:'你还是喜欢用座机。拨号盘的转动声里，有过去的回音。', eff:{}, tags:['old_school'] }
  ]},
{ id:'l_grand_edu', min:52, max:66, era:'any', cond:{ tag:'grandparent' },
  text:'孙辈的教育分歧来了：孩子要「快乐教育」，你想「严师出高徒」。',
  options:[
    { t:'尊重儿女的管教方式', say:'你把想说的话咽了回去，转头教孙子包饺子。有些传承，在书桌外。', eff:{eq:2}, tags:['cool_elder'] },
    { t:'坚持自己的老法子', say:'孙子的毛笔字确实进步了，儿子的脸色也不太好看。', eff:{iq:-1,body:1}, tags:['old_school'] },
    { t:'分工：文归儿女，玩归自己', say:'你负责讲故事、捉虫子、放风筝。全家各司其职，其乐融融。', eff:{eq:1,body:1}, tags:['grandparent'] }
  ]},
{ id:'l_final_wish', min:70, max:88, era:'any',
  text:'你忽然很想完成一件事——趁还走得动。',
  options:[
    { t:'回一次故乡，寻访旧居', say:'老井还在，树粗了一围。你坐在门槛上，像小时候那样看了一场日落。', eff:{eq:2}, tags:['nostalgic'] },
    { t:'办一场小小的展/宴，谢过亲故', say:'来了六十多个人。你站在中间，忽然哽咽：原来我这一生，被这么多人爱过。', eff:{eq:2,wealth:-1}, tags:['kind'] },
    { t:'拍一张全家福，最大那张', say:'四世同堂挤在一起，快门按下的那一秒，时间都笑了。', eff:{eq:1}, tags:['family_elder'], cond:{ tag:'parent' } }
  ]}
];

/* ================================================================
   随机小事件（35%/年抽取）32 条
================================================================ */
var RANDOM_MINOR = [
  { era:'any', text:'路上捡到一笔小钱。你四下张望，交给了失主/里正/警察。对方千恩万谢。', eff:{eq:1} },
  { era:'any', text:'染了场风寒，躺了几天。病好后更懂得爱惜身体。', eff:{body:-1} },
  { era:'any', text:'一位长辈/前辈很欣赏你，提点了几句，让你少走两年弯路。', eff:{iq:1} },
  { era:'any', text:'老友来访，把酒言欢到深夜。有些情谊，岁月冲不淡。', eff:{eq:1} },
  { era:'any', text:'心血来潮学了道新菜/新曲子，意外地平添了许多生活乐趣。', eff:{talent:1} },
  { era:'any', text:'与人起了点小争执，冷战三天后你先递了台阶。成年人的体面。', eff:{eq:-1} },
  { era:'any', text:'读到一本好书/听到一席好话，心里亮堂了好一阵子。', eff:{iq:1} },
  { era:'any', text:'你种的葡萄/养的猫今年格外争气，邻里都来道贺。', eff:{eq:1} },
  { era:'any', text:'摔了一跤，万幸无碍。你从此走路都带点小心。', eff:{body:-1} },
  { era:'any', text:'帮邻里修了回屋顶/代了回班，人情账上又添一笔。', eff:{eq:1,body:-1} },
  { era:'any', text:'收到一份意外的小礼物，是早年帮过的人家送来的。', eff:{eq:1}, cond:{ tag:'kind' } },
  { era:'ancient', text:'今年风调雨顺，收成/生意比往年都好。', eff:{wealth:1} },
  { era:'ancient', text:'集市上你把一件旧物卖出了好价钱，眼光被夸了一路。', eff:{wealth:1} },
  { era:'ancient', text:'庙会看大戏，你偶遇多年不见的同窗，两人聊到灯熄。', eff:{eq:1} },
  { era:'ancient', text:'你去河边垂钓半日，鱼获不多，心里那点烦闷全没了。', eff:{eq:1,body:1} },
  { era:'ancient', text:'替邻里写了两封书信，谢礼是一篮子鲜鸡蛋。', eff:{wealth:1,eq:1}, cond:{ minIq:5 } },
  { era:'ancient', text:'你的手艺活被人带到了府城，据说连行家都赞了一声。', eff:{wealth:1}, cond:{ minTalent:6 } },
  { era:'minguo', text:'物价又涨了，手里的钱不禁花。你学会了精打细算。', eff:{iq:1} },
  { era:'minguo', text:'电车/黄包车上偶遇旧相识，你们聊了半座城的长短。', eff:{eq:1} },
  { era:'minguo', text:'茶馆说书先生把你的事迹编进了段子，你听得直乐。', eff:{eq:1}, cond:{ minPower:5 } },
  { era:'modern', text:'公司/单位发了一笔意外的奖金。你犒劳了自己一顿好的。', eff:{wealth:1} },
  { era:'modern', text:'抢到一张特价票，来了场说走就走的短途旅行。', eff:{eq:1} },
  { era:'modern', text:'手机摔碎了屏，心疼了三天。破财免灾，破财免灾。', eff:{wealth:-1} },
  { era:'modern', text:'你的副业/作品被大V转发，涨了几百个粉丝。', eff:{talent:1}, cond:{ anytag:['writing','creator','stall'] } },
  { era:'modern', text:'小区业委会换届，你被推举了个闲职，居然干得有模有样。', eff:{power:1,eq:1} },
  { era:'modern', text:'体检各项达标。医生说：继续保持。你出门买了斤排骨。', eff:{body:1}, cond:{ tag:'wellness' } },
  { era:'modern', text:'你识破了一个诈骗电话，还顺带提醒了楼上独居的老人。', eff:{eq:1,iq:1} },
  { era:'modern', text:'加班到深夜，出租车师傅的一句「辛苦了」，差点让你泪崩。', eff:{eq:-1} },
  { era:'modern', text:'参加马拉松/健步走，你完赛了，奖牌挂在书房最显眼处。', eff:{body:1,eq:1}, cond:{ anytag:['runner','sport'] } },
  { era:'modern', text:'旧书市场淘到一本绝版书，摊主只收了你半价。', eff:{iq:1}, cond:{ minIq:5 } },
  { era:'any', text:'救助过的那只猫的后代，又出现在你家门口。缘分这东西，妙不可言。', cond:{ tag:'kind' }, eff:{eq:1} },
  { era:'any', text:'你的一项小手艺被邻里/同事发现，渐渐有人慕名来求。', cond:{ minTalent:6 }, eff:{wealth:1} }
];

/* ================================================================
   重大变故（10%/年抽取，低频）13 条
================================================================ */
var RANDOM_MAJOR = [
  { id:'maj_ill', era:'any', text:'【重大变故】一场急病突如其来，病势汹汹。', ill:true },
  { id:'maj_poor', era:'any', text:'【重大变故】家中遭了变故，积蓄去了大半。', eff:{wealth:-3} },
  { id:'maj_war', era:'ancient', text:'【重大变故】边关战事起，家乡遭兵祸，你随乡亲逃难，九死一生。', eff:{wealth:-2,body:-2}, setTag:'refugee', setCause:'war' },
  { id:'maj_accident', era:'modern', text:'【重大变故】一场交通事故，万幸人无大碍，但也休养了好一阵。', eff:{body:-2,wealth:-1} },
  { id:'maj_windfall', era:'modern', text:'【天降横财】老家的房子拆迁/早年的一笔投资翻了数倍！', eff:{wealth:4} },
  { id:'maj_guiren', era:'any', text:'【贵人相助】一位有分量的人欣赏你的品行，在关键时刻拉了你一把。', eff:{power:2}, cond:{ minEq:6 } },
  { id:'maj_loss', era:'any', text:'【重大变故】一位至亲离世。你忽然发现，来日方长是世界上最温柔的谎言。', eff:{eq:-1}, requireAge:30 },
  { id:'maj_famine', era:'ancient', text:'【重大变故】大旱三载，赤地千里。你带着全家吃糖咽菜，熬过了最难的日子。', eff:{body:-3,wealth:-2}, requireAge:8, setCause:'famine', chance:0.35 },
  { id:'maj_flood', era:'ancient', text:'【重大变故】夏汛山洪，大水冲了屋和田。你在齐腰的水里捞回了些家当。', eff:{wealth:-2,body:-1}, setTag:'hardship' },
  { id:'maj_bandit', era:'ancient', text:'【重大变故】山匪过境。你护着家人躲在柴房，听着院子里的鸡飞狗跳。', eff:{wealth:-2,body:-1}, cond:{ maxWealth:6 } },
  { id:'maj_fire', era:'any', text:'【重大变故】一场走水/火灾，半条街的屋舍付之一炬，你家的房子成了焦土。', eff:{wealth:-3,body:-1} },
  { id:'maj_lawsuit', era:'any', text:'【重大变故】一桩无妄的官司缠上了你。打点、周旋、等待，耗去一年光阴与积蓄。', eff:{wealth:-2,power:-1}, cond:{ maxPower:5 } },
  { id:'maj_market', era:'modern', text:'【重大变故】市场急转直下，你重仓的资产腰斩再腰斩。', eff:{wealth:-3}, cond:{ minWealth:5 } },
  { id:'maj_epidemic', era:'ancient', text:'【重大变故】时疫流行，你染病卧床月余。郎中来了三回，家里人熬红了眼。', ill:true, requireAge:5 }
];

/* ================================================================
   结局称号评定表（顺序即优先级）20 条
================================================================ */
var TITLES = [
  { ok:function(s,a){ return s.tags.has('official') && a.power>=8; }, title:'一代名臣', sub:'居庙堂之高，守心中之尺' },
  { ok:function(s,a){ return s.tags.has('general') && a.power>=7; }, title:'沙场宿将', sub:'金戈铁马，气吞万里如虎' },
  { ok:function(s,a){ return s.tags.has('knight') || (s.tags.has('wuxia') && a.body>=7); }, title:'江湖侠客', sub:'仗剑走天涯，快意泯恩仇' },
  { ok:function(s,a){ return s.tags.has('tycoon') && a.wealth>=8; }, title:'富甲一方', sub:'算盘一响，黄金万两' },
  { ok:function(s,a){ return s.tags.has('doctor') && a.talent>=6; }, title:'杏林圣手', sub:'悬壶济世，活人无数' },
  { ok:function(s,a){ return s.tags.has('craft_master') || (s.tags.has('craft') && a.talent>=8); }, title:'巧夺天工', sub:'一双拙手，做出了传世活计' },
  { ok:function(s,a){ return s.tags.has('mentor') || s.tags.has('teacher'); }, title:'桃李满门', sub:'薪火相传，斯文不坠' },
  { ok:function(s,a){ return s.tags.has('writing') && a.iq>=7; }, title:'文章巨公', sub:'以笔为犁，耕耘了半个世纪' },
  { ok:function(s,a){ return s.tags.has('art') && a.talent>=7; }, title:'丹青妙手', sub:'把热爱活成了一生的事业' },
  { ok:function(s,a){ return s.tags.has('philanthropist'); }, title:'一方善士', sub:'散财济世，不留姓名' },
  { ok:function(s,a){ return s.tags.has('press') && a.iq>=6; }, title:'铁笔铮铮', sub:'铁肩担道义，妙手著文章' },
  { ok:function(s,a){ return s.tags.has('hermit') || s.tags.has('fisher'); }, title:'田园隐士', sub:'采菊东篱下，悠然见南山' },
  { ok:function(s,a){ return s.tags.has('runner') || (s.tags.has('sport') && a.body>=8); }, title:'健步一生', sub:'把身体活成了最好的本钱' },
  { ok:function(s,a){ return s.tags.has('wanderer') || s.tags.has('traveler'); }, title:'行者无疆', sub:'见过天地，见过众生，见过自己' },
  { ok:function(s,a){ return s.tags.has('filial'); }, title:'至孝之人', sub:'你养我小，我养你老' },
  { ok:function(s,a){ return s.tags.has('parent') && s.tags.has('zen_parent'); }, title:'温暖的港湾', sub:'孩子眼里，你是全世界最好的大人' },
  { ok:function(s,a){ return s.tags.has('survivor') && a.body>=5; }, title:'向死而生', sub:'从鬼门关回来的人，最懂人间烟火' },
  { ok:function(s,a){ return s.tags.has('resilient'); }, title:'野火烧不尽', sub:'命运按着你摩擦，你却总是重新站起' },
  { ok:function(s,a){ return s.tags.has('stable_invest') && a.wealth>=7; }, title:'克勤克俭', sub:'一分一厘，都是日子的底气' },
  { ok:function(s,a){ return a.eq>=8; }, title:'人间暖阳', sub:'你到过的地方，都亮了一点' }
];
var DEFAULT_TITLE = { title:'平凡而温热的一生', sub:'没干过惊天动地的大事，但把每一天都过得有滋有味' };

var DEATH_CAUSES = {
  illness: '病逝', accident: '意外身故', war: '死于兵祸',
  famine: '死于饥馑', age: '寿终正寝'
};

/* 父母职业家世加成（加多少，就从其他属性等量扣回，总和恒定 30） */
var OCC_BONUS = {
  '小商贩':{wealth:1},'商铺掌柜':{wealth:1},'个体户':{wealth:1},'企业高管':{wealth:2,power:1},
  '县衙小吏':{power:1},'公务员':{power:1},'落第书生':{iq:1},'私塾先生':{iq:1},'教师':{iq:1},
  '郎中':{talent:1},'医生':{iq:1},'西医大夫':{iq:1},'武将':{body:1},'农夫':{body:1},'农民':{body:1},
  '木匠':{talent:1},'厂工':{body:1},'纱厂工人':{body:1},'黄包车夫':{body:1},'程序员':{iq:1},
  '军阀幕僚':{power:1},'报馆编辑':{eq:1},'渔夫':{body:1}
};

window.__lifeData = {
  ERA_GROUPS: ERA_GROUPS, ERA_OF: ERA_OF, OCCUPATIONS: OCCUPATIONS,
  ATTRS: ATTRS, TOTAL_POINTS: TOTAL_POINTS,
  INFANT_TEXTS: INFANT_TEXTS, ZHUAZHOU: ZHUAZHOU, CLASSICS: CLASSICS,
  DECISIONS: DECISIONS, RANDOM_MINOR: RANDOM_MINOR, RANDOM_MAJOR: RANDOM_MAJOR,
  TITLES: TITLES, DEFAULT_TITLE: DEFAULT_TITLE,
  DEATH_CAUSES: DEATH_CAUSES, OCC_BONUS: OCC_BONUS,
  stats: function () { return { decisions: DECISIONS.length, minor: RANDOM_MINOR.length, major: RANDOM_MAJOR.length, titles: TITLES.length }; }
};
})();
