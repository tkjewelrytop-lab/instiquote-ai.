/* One-time Traditional Chinese migration for existing browser-local demo records. */
(function (global) {
  'use strict';
  if (!global.IQ || global.IQLocale) return;
  const LOCALE = 'zh-Hant-HK';
  const CHARACTERS = {"与":"與","专":"專","业":"業","两":"兩","个":"個","为":"為","习":"習","于":"於","仅":"僅","从":"從","们":"們","价":"價","会":"會","传":"傳","体":"體","余":"餘","关":"關","内":"內","写":"寫","准":"準","击":"擊","创":"創","别":"別","务":"務","动":"動","区":"區","协":"協","单":"單","厅":"廳","参":"參","发":"發","号":"號","后":"後","启":"啓","吴":"吳","员":"員","响":"響","园":"園","图":"圖","场":"場","处":"處","备":"備","复":"復","学":"學","实":"實","审":"審","对":"對","导":"導","将":"將","尽":"盡","币":"幣","师":"師","带":"帶","帮":"幫","并":"並","应":"應","开":"開","张":"張","当":"當","录":"錄","态":"態","总":"總","戏":"戲","报":"報","拟":"擬","择":"擇","换":"換","据":"據","摊":"攤","数":"數","无":"無","时":"時","显":"顯","暂":"暫","机":"機","权":"權","条":"條","来":"來","标":"標","检":"檢","欢":"歡","沟":"溝","没":"沒","浏":"瀏","游":"遊","满":"滿","点":"點","状":"狀","独":"獨","现":"現","电":"電","码":"碼","确":"確","称":"稱","筛":"篩","类":"類","级":"級","线":"線","练":"練","组":"組","细":"細","经":"經","结":"結","给":"給","络":"絡","统":"統","继":"繼","续":"續","维":"維","编":"編","联":"聯","节":"節","获":"獲","营":"營","补":"補","见":"見","观":"觀","规":"規","览":"覽","计":"計","订":"訂","认":"認","讨":"討","让":"讓","记":"記","论":"論","设":"設","证":"證","评":"評","诉":"訴","词":"詞","试":"試","话":"話","该":"該","详":"詳","说":"説","请":"請","课":"課","调":"調","账":"賬","货":"貨","购":"購","费":"費","资":"資","踪":"蹤","轻":"輕","较":"較","输":"輸","过":"過","运":"運","还":"還","这":"這","进":"進","连":"連","适":"適","选":"選","邮":"郵","采":"採","里":"裏","钟":"鍾","锁":"鎖","键":"鍵","门":"門","闭":"閉","问":"問","间":"間","际":"際","陈":"陳","险":"險","随":"隨","隐":"隱","顶":"頂","项":"項","须":"須","预":"預","题":"題","额":"額","验":"驗","骤":"驟","黄":"黃","齐":"齊","龙":"龍"};
  const PHRASES = {"为小四学生安排半天 STEM 创意科学工作坊，共 60 人，分两组进行。希望包含动手实验、材料及导师，活动时间为下月星期五下午。":"為小四學生安排半天 STEM 創意科學工作坊，共 60 人，分兩組進行。希望包含動手實驗、材料及導師，活動時間為下月星期五下午。","开放日需要三个互动游戏摊位，预计 200 人参加，活动为期四小时，报价需包括工作人员、布置、器材及撤场。":"開放日需要三個互動遊戲攤位，預計 200 人參加，活動為期四小時，報價需包括工作人員、佈置、器材及撤場。","为 80 名小五学生安排两节科学探索课程，每节 90 分钟，需包含材料、导师及课堂活动。":"為 80 名小五學生安排兩節科學探索課程，每節 90 分鐘，需包含材料、導師及課堂活動。","包含 2 位专业导师、全套教学材料及学生作品，课程结束后提供活动总结。":"包含 2 位專業導師、全套教學材料及學生作品，課程結束後提供活動總結。","为小三学生提供四节图形化编程入门课程，包含导师、教学设计及课后练习。":"為小三學生提供四節圖形化編程入門課程，包含導師、教學設計及課後練習。","包含课程设计、导师、学生材料及成果展示，可按学校需要调整教学内容。":"包含課程設計、導師、學生材料及成果展示，可按學校需要調整教學內容。","提供完整活动流程、导师服务及互动教学工具，包含基本保险及交通费用。":"提供完整活動流程、導師服務及互動教學工具，包含基本保險及交通費用。","包含课前协调、到校教学及学生学习材料，提供活动照片及成果记录。":"包含課前協調、到校教學及學生學習材料，提供活動照片及成果記錄。","提供分组教学、器材租用及课后学习单，报价已包含交通及材料费用。":"提供分組教學、器材租用及課後學習單，報價已包含交通及材料費用。","已完成需求整理，供应商将根据相同规格提供报价。":"已完成需求整理，供應商將根據相同規格提供報價。","小四 STEM 创意科学工作坊":"小四 STEM 創意科學工作坊","五份报价已备齐，可以开始比较":"五份報價已備齊，可以開始比較","小三创意编程入门课程":"小三創意編程入門課程","小五科学探索体验课程":"小五科學探索體驗課程","收到一份新的匿名报价":"收到一份新的匿名報價","校园开放日需求已提交":"校園開放日需求已提交","老师已选定课程供应商":"老師已選定課程供應商","校园开放日互动摊位":"校園開放日互動攤位","创学教育有限公司":"創學教育有限公司","明德学校（演示）":"明德學校（演示）","育才小学（演示）":"育才小學（演示）","启思教育工作室":"啓思教育工作室","同行校园工程":"同行校園工程","悦动教育活动":"悦動教育活動","星河校园服务":"星河校園服務","智趣教学资源":"智趣教學資源","青苗创意制作":"青苗創意製作","供应商 A":"供應商 A","供应商 B":"供應商 B","供应商 C":"供應商 C","供应商 D":"供應商 D","供应商 E":"供應商 E","九龙城区":"九龍城區","到校活动":"到校活動","到校课程":"到校課程","印刷制作":"印刷製作","小型维修":"小型維修","截止时间":"截止時間","提交报价":"提交報價","电子邮箱":"電子郵箱","确认接单":"確認接單","需求讨论":"需求討論","中西区":"中西區","供应商":"供應商","吴小姐":"吳小姐","屯门区":"屯門區","已暂停":"已暫停","已结束":"已結束","已选定":"已選定","张先生":"張先生","沙田区":"沙田區","浏览器":"瀏覽器","观塘区":"觀塘區","陈先生":"陳先生","陈老师":"陳老師","黄先生":"黃先生","发送":"發送","地区":"地區","失败":"失敗","当前":"當前","报价":"報價","接单":"接單","活动":"活動","类别":"類別","老师":"老師","联络":"聯絡","订单":"訂單","课程":"課程","资料":"資料","重试":"重試","错误":"錯誤","请":"請","参加":"參加","分钟":"分鐘","时钟":"時鐘","倒计时":"倒數計時","小时":"小時","这里":"這裏","里面":"裏面","说明":"說明"};
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phrasePattern = new RegExp(Object.keys(PHRASES).sort((a,b)=>b.length-a.length).map(escapeRegex).join('|'), 'g');
  const protectedKeys = new Set(['id','requestId','supplierId','selectedQuoteId','templateId','status','type','plan','author','recipientType','locale','email','phone','recipientPhone','url','files','attachmentName']);

  // Known complete phrases retain the Hong Kong conversion of ambiguous characters.
  function text(value) {
    if (typeof value !== 'string' || !/[\u3400-\u9fff]/.test(value) || /^(?:https?:\/\/|mailto:)/i.test(value)) return value;
    if (Object.prototype.hasOwnProperty.call(PHRASES, value)) return PHRASES[value];
    const converted = value.replace(phrasePattern, phrase => PHRASES[phrase]);
    return Array.from(converted, character => CHARACTERS[character] || character).join('');
  }

  function visit(value, key) {
    if (protectedKeys.has(key) || /(?:Id|Url|URL)$/.test(key || '')) return value;
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(item => visit(item, ''));
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(childKey => { value[childKey] = visit(value[childKey], childKey); });
    }
    return value;
  }

  // Keep IDs, statuses, attachments and all existing records; only displayed text changes.
  function migrateState(state) {
    if (!state || typeof state !== 'object' || state.locale === LOCALE) return state;
    visit(state, '');
    state.locale = LOCALE;
    return state;
  }
  function migrateDraft(draft) { return visit(draft, ''); }

  const originalLoad = global.IQ.load;
  const originalSeed = global.IQ.seed;
  const originalReset = global.IQ.reset;
  global.IQ.load = function () {
    const state = originalLoad.apply(this, arguments);
    const needsMigration = state && state.locale !== LOCALE;
    migrateState(state);
    if (needsMigration) global.IQ.save(state);
    return state;
  };
  global.IQ.seed = function () { return migrateState(originalSeed.apply(this, arguments)); };
  global.IQ.reset = function () { return global.IQ.save(migrateState(originalReset.apply(this, arguments))); };
  global.IQLocale = { text, migrateState, migrateDraft };
})(typeof window !== 'undefined' ? window : globalThis);
