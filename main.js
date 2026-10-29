// Linked Quran — Obsidian eklentisi (hedef 16; o101, 1.3.0 o115): kasa ↔ site
// iki yönlü senkron. Kasadaki sure notlarını senkron anahtarıyla
// linkedquran.com'a gönderir, sitedeki hâli (notlar, kendi meal) kasaya çeker.
// GitHub/git gerekmez. Sözleşme docs/veri-tasima.md "Senkron"; uç nokta
// GitHub Action'ınkiyle aynı (Action tek yön kalır). Derleme adımı yok: düz CommonJS.
// 1.4.0 (o144): sure sayfası sitenin ayet kartı gibi — not ayet kutusunun
// içinde, Draft rozeti + Publish, işaret satırları gizli, boş notta yer tutucu,
// meal sekmesi + yana kaydırma, `/3:7` ayet menüsü (kullanıcı kararları «A»,
// «ikisi birden», «/ menüsü de gelsin»). Eklentisiz kasa `linkedquran.css` ile kalır.
// 1.5.0 (o145): yerel-öncelikli — yalnız Yayın alanı gider; Taslak alanı ve
// kendi meal kasada kalır, çekme onları ezmez (`birlestir`). «Back to draft»
// yayımdaki notu Taslak'a indirir, sunucuya yalnız kimliği gider (`geri_cek`).
// Sitede silinen not kasada `deleted on site` işaretiyle kalır (kullanıcı
// kararları o144 «yalnız yayımlanan gider», o145 «Aynısı olsun», rozet «A»).
const {
  Notice, Plugin: EklentiTabani, PluginSettingTab, Setting, TFile, moment, requestUrl, EditorSuggest, Modal, ItemView, MarkdownView, MarkdownRenderer, setIcon,
  editorInfoField, editorLivePreviewField,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- derlemesiz CommonJS eklenti: Obsidian modülü `require`la gelir
} = require("obsidian");
// CodeMirror'u Obsidian verir (derlemesiz eklentide `require` ile; paket bağımlılığı yok, çalışma anında Obsidian'ın).
// eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies -- yukarıdaki gerekçe
const cm = { ...require("@codemirror/state"), ...require("@codemirror/view") };

const SURUM = "1.18.0";
const ANAHTAR_ONEK = "lq_"; // senkron anahtarı biçimi (ayar ipucu)
const ANAHTAR = /^lq_[A-Za-z0-9_-]{43}$/; // 1.16.0 bağlantısı: sitenin kasa ucundaki desen
const VARSAYILAN = { anahtar: "", adres: "https://linkedquran.com" };
const BEKLEME = 60_000; // son değişiklikten bu kadar sonra gönderilir
const ACIK_DOSYA = 30_000; // ponytail: açık dosyaya son tuştan bu kadar sonra yazılır; yazma durmazsa bekler
const CEKME = 1_800_000; // bu aralıkla ve pencere odaklanınca yalnız çekme (1.6.0: 5 → 30 dk, kullanıcı kararı o148)
const CIHAZ = "linkedquran-cihaz"; // app.saveLocalStorage anahtarı: cihaza özel, eşlenmez
const YENILEME = 7 * 86_400_000; // 1.12.0: açılan surenin site metni bu cihazda en çok haftada bir yenilenir
const KUYRUK = "linkedquran-kuyruk"; // 1.7.0 eylem kuyruğu, adrese göre; cihazda: iCloud'la başka cihaza gidip iki kez gönderilmesin
const SURE = /^---\r?\n(?:(?!---).*\r?\n)*?(?:type|tur): "?linkedquran\/(?:surah|sure)"?\r?\n/; // tur/sure: o107 öncesi kasa
const KALIPLAR = ["default", "ammarcodes", "subaanqasim", "quranhelper", "quranlookup"]; // src/lib/obsidian-kasa.ts

// --- sayfa başla ---
// Medine mushafının 604 sayfa başı [sure, ayet] (`public/kuran/gezinme.json`, quran.com v4) ve 114 surenin
// ayet sayısı (`public/kuran/dizin.json`); test:kasa ikisini kaynağıyla karşılaştırır.
const SAYFA_BASLARI = [[1,1],[2,1],[2,6],[2,17],[2,25],[2,30],[2,38],[2,49],[2,58],[2,62],[2,70],[2,77],[2,84],[2,89],[2,94],[2,102],[2,106],[2,113],[2,120],[2,127],[2,135],[2,142],[2,146],[2,154],[2,164],[2,170],[2,177],[2,182],[2,187],[2,191],[2,197],[2,203],[2,211],[2,216],[2,220],[2,225],[2,231],[2,234],[2,238],[2,246],[2,249],[2,253],[2,257],[2,260],[2,265],[2,270],[2,275],[2,282],[2,283],[3,1],[3,10],[3,16],[3,23],[3,30],[3,38],[3,46],[3,53],[3,62],[3,71],[3,78],[3,84],[3,92],[3,101],[3,109],[3,116],[3,122],[3,133],[3,141],[3,149],[3,154],[3,158],[3,166],[3,174],[3,181],[3,187],[3,195],[4,1],[4,7],[4,12],[4,15],[4,20],[4,24],[4,27],[4,34],[4,38],[4,45],[4,52],[4,60],[4,66],[4,75],[4,80],[4,87],[4,92],[4,95],[4,102],[4,106],[4,114],[4,122],[4,128],[4,135],[4,141],[4,148],[4,155],[4,163],[4,171],[4,176],[5,3],[5,6],[5,10],[5,14],[5,18],[5,24],[5,32],[5,37],[5,42],[5,46],[5,51],[5,58],[5,65],[5,71],[5,77],[5,83],[5,90],[5,96],[5,104],[5,109],[5,114],[6,1],[6,9],[6,19],[6,28],[6,36],[6,45],[6,53],[6,60],[6,69],[6,74],[6,82],[6,91],[6,95],[6,102],[6,111],[6,119],[6,125],[6,132],[6,138],[6,143],[6,147],[6,152],[6,158],[7,1],[7,12],[7,23],[7,31],[7,38],[7,44],[7,52],[7,58],[7,68],[7,74],[7,82],[7,88],[7,96],[7,105],[7,121],[7,131],[7,138],[7,144],[7,150],[7,156],[7,160],[7,164],[7,171],[7,179],[7,188],[7,196],[8,1],[8,9],[8,17],[8,26],[8,34],[8,41],[8,46],[8,53],[8,62],[8,70],[9,1],[9,7],[9,14],[9,21],[9,27],[9,32],[9,37],[9,41],[9,48],[9,55],[9,62],[9,69],[9,73],[9,80],[9,87],[9,94],[9,100],[9,107],[9,112],[9,118],[9,123],[10,1],[10,7],[10,15],[10,21],[10,26],[10,34],[10,43],[10,54],[10,62],[10,71],[10,79],[10,89],[10,98],[10,107],[11,6],[11,13],[11,20],[11,29],[11,38],[11,46],[11,54],[11,63],[11,72],[11,82],[11,89],[11,98],[11,109],[11,118],[12,5],[12,15],[12,23],[12,31],[12,38],[12,44],[12,53],[12,64],[12,70],[12,79],[12,87],[12,96],[12,104],[13,1],[13,6],[13,14],[13,19],[13,29],[13,35],[13,43],[14,6],[14,11],[14,19],[14,25],[14,34],[14,43],[15,1],[15,16],[15,32],[15,52],[15,71],[15,91],[16,7],[16,15],[16,27],[16,35],[16,43],[16,55],[16,65],[16,73],[16,80],[16,88],[16,94],[16,103],[16,111],[16,119],[17,1],[17,8],[17,18],[17,28],[17,39],[17,50],[17,59],[17,67],[17,76],[17,87],[17,97],[17,105],[18,5],[18,16],[18,21],[18,28],[18,35],[18,46],[18,54],[18,62],[18,75],[18,84],[18,98],[19,1],[19,12],[19,26],[19,39],[19,52],[19,65],[19,77],[19,96],[20,13],[20,38],[20,52],[20,65],[20,77],[20,88],[20,99],[20,114],[20,126],[21,1],[21,11],[21,25],[21,36],[21,45],[21,58],[21,73],[21,82],[21,91],[21,102],[22,1],[22,6],[22,16],[22,24],[22,31],[22,39],[22,47],[22,56],[22,65],[22,73],[23,1],[23,18],[23,28],[23,43],[23,60],[23,75],[23,90],[23,105],[24,1],[24,11],[24,21],[24,28],[24,32],[24,37],[24,44],[24,54],[24,59],[24,62],[25,3],[25,12],[25,21],[25,33],[25,44],[25,56],[25,68],[26,1],[26,20],[26,40],[26,61],[26,84],[26,112],[26,137],[26,160],[26,184],[26,207],[27,1],[27,14],[27,23],[27,36],[27,45],[27,56],[27,64],[27,77],[27,89],[28,6],[28,14],[28,22],[28,29],[28,36],[28,44],[28,51],[28,60],[28,71],[28,78],[28,85],[29,7],[29,15],[29,24],[29,31],[29,39],[29,46],[29,53],[29,64],[30,6],[30,16],[30,25],[30,33],[30,42],[30,51],[31,1],[31,12],[31,20],[31,29],[32,1],[32,12],[32,21],[33,1],[33,7],[33,16],[33,23],[33,31],[33,36],[33,44],[33,51],[33,55],[33,63],[34,1],[34,8],[34,15],[34,23],[34,32],[34,40],[34,49],[35,4],[35,12],[35,19],[35,31],[35,39],[35,45],[36,13],[36,28],[36,41],[36,55],[36,71],[37,1],[37,25],[37,52],[37,77],[37,103],[37,127],[37,154],[38,1],[38,17],[38,27],[38,43],[38,62],[38,84],[39,6],[39,11],[39,22],[39,32],[39,41],[39,48],[39,57],[39,68],[39,75],[40,8],[40,17],[40,26],[40,34],[40,41],[40,50],[40,59],[40,67],[40,78],[41,1],[41,12],[41,21],[41,30],[41,39],[41,47],[42,1],[42,11],[42,16],[42,23],[42,32],[42,45],[42,52],[43,11],[43,23],[43,34],[43,48],[43,61],[43,74],[44,1],[44,19],[44,40],[45,1],[45,14],[45,23],[45,33],[46,6],[46,15],[46,21],[46,29],[47,1],[47,12],[47,20],[47,30],[48,1],[48,10],[48,16],[48,24],[48,29],[49,5],[49,12],[50,1],[50,16],[50,36],[51,7],[51,31],[51,52],[52,15],[52,32],[53,1],[53,27],[53,45],[54,7],[54,28],[54,50],[55,17],[55,41],[55,68],[56,17],[56,51],[56,77],[57,4],[57,12],[57,19],[57,25],[58,1],[58,7],[58,12],[58,22],[59,4],[59,10],[59,17],[60,1],[60,6],[60,12],[61,6],[62,1],[62,9],[63,5],[64,1],[64,10],[65,1],[65,6],[66,1],[66,8],[67,1],[67,13],[67,27],[68,16],[68,43],[69,9],[69,35],[70,11],[70,40],[71,11],[72,1],[72,14],[73,1],[73,20],[74,18],[74,48],[75,20],[76,6],[76,26],[77,20],[78,1],[78,31],[79,16],[80,1],[81,1],[82,1],[83,7],[83,35],[85,1],[86,1],[87,16],[89,1],[89,24],[91,1],[92,15],[95,1],[97,1],[98,8],[100,10],[103,1],[106,1],[109,1],[112,1]];
const AYET_SAYILARI = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
/** Surenin mushaf sayfaları `[{ sayfa, bas, son }]`; sure ortasında başlayan sayfa da girer. */
const sayfaAraliklari = (s) => {
  const r = [];
  SAYFA_BASLARI.forEach(([ss, sa], i) => {
    const [ns, na] = SAYFA_BASLARI[i + 1] ?? [115, 1];
    if (ss > s || ns < s || (ns === s && na === 1)) return;
    const bas = ss === s ? sa : 1;
    const son = ns === s ? na - 1 : AYET_SAYILARI[s - 1];
    if (bas <= son) r.push({ sayfa: i + 1, bas, son });
  });
  return r;
};
// 1.18.0 (gezgin-ana): gezginin «ayete git» kutusu. 114 surenin [slug, name_en] (`public/kuran/dizin.json`;
// test:kasa kaynağıyla karşılaştırır). Ad: önce tam eşleşme, sonra önek (önekte küçük numara); takı yalnız listedekiler
// («Ya-Sin»in «Ya-»sı ad).
const SURE_ADLARI = [["fatiha","Al-Fatihah"],["bakara","Al-Baqarah"],["ali-imran","Ali 'Imran"],["nisa","An-Nisa"],["maide","Al-Ma'idah"],["enam","Al-An'am"],["araf","Al-A'raf"],["enfal","Al-Anfal"],["tevbe","At-Tawbah"],["yunus","Yunus"],["hud","Hud"],["yusuf","Yusuf"],["rad","Ar-Ra'd"],["ibrahim","Ibrahim"],["hicr","Al-Hijr"],["nahl","An-Nahl"],["isra","Al-Isra"],["kehf","Al-Kahf"],["meryem","Maryam"],["taha","Taha"],["enbiya","Al-Anbiya"],["hacc","Al-Hajj"],["muminun","Al-Mu'minun"],["nur","An-Nur"],["furkan","Al-Furqan"],["suara","Ash-Shu'ara"],["neml","An-Naml"],["kasas","Al-Qasas"],["ankebut","Al-'Ankabut"],["rum","Ar-Rum"],["lokman","Luqman"],["secde","As-Sajdah"],["ahzab","Al-Ahzab"],["sebe","Saba"],["fatir","Fatir"],["yasin","Ya-Sin"],["saffat","As-Saffat"],["sad","Sad"],["zumer","Az-Zumar"],["mumin","Ghafir"],["fussilet","Fussilat"],["sura","Ash-Shuraa"],["zuhruf","Az-Zukhruf"],["duhan","Ad-Dukhan"],["casiye","Al-Jathiyah"],["ahkaf","Al-Ahqaf"],["muhammed","Muhammad"],["fetih","Al-Fath"],["hucurat","Al-Hujurat"],["kaf","Qaf"],["zariyat","Adh-Dhariyat"],["tur","At-Tur"],["necm","An-Najm"],["kamer","Al-Qamar"],["rahman","Ar-Rahman"],["vakia","Al-Waqi'ah"],["hadid","Al-Hadid"],["mucadele","Al-Mujadila"],["hasr","Al-Hashr"],["mumtehine","Al-Mumtahanah"],["saff","As-Saf"],["cuma","Al-Jumu'ah"],["munafikun","Al-Munafiqun"],["tegabun","At-Taghabun"],["talak","At-Talaq"],["tahrim","At-Tahrim"],["mulk","Al-Mulk"],["kalem","Al-Qalam"],["hakka","Al-Haqqah"],["mearic","Al-Ma'arij"],["nuh","Nuh"],["cinn","Al-Jinn"],["muzzemmil","Al-Muzzammil"],["muddessir","Al-Muddaththir"],["kiyame","Al-Qiyamah"],["insan","Al-Insan"],["murselat","Al-Mursalat"],["nebe","An-Naba"],["naziat","An-Nazi'at"],["abese","'Abasa"],["tekvir","At-Takwir"],["infitar","Al-Infitar"],["mutaffifin","Al-Mutaffifin"],["insikak","Al-Inshiqaq"],["buruc","Al-Buruj"],["tarik","At-Tariq"],["ala","Al-A'la"],["gasiye","Al-Ghashiyah"],["fecr","Al-Fajr"],["beled","Al-Balad"],["sems","Ash-Shams"],["leyl","Al-Layl"],["duha","Ad-Duhaa"],["insirah","Ash-Sharh"],["tin","At-Tin"],["alak","Al-'Alaq"],["kadir","Al-Qadr"],["beyyine","Al-Bayyinah"],["zilzal","Az-Zalzalah"],["adiyat","Al-'Adiyat"],["karia","Al-Qari'ah"],["tekasur","At-Takathur"],["asr","Al-'Asr"],["humeze","Al-Humazah"],["fil","Al-Fil"],["kureys","Quraysh"],["maun","Al-Ma'un"],["kevser","Al-Kawthar"],["kafirun","Al-Kafirun"],["nasr","An-Nasr"],["tebbet","Al-Masad"],["ihlas","Al-Ikhlas"],["felak","Al-Falaq"],["nas","An-Nas"]];
const TAKI = /^(?:al|el|an|en|ar|er|as|es|ash|at|et|ad|ed|adh|az|ez|ath)[\s-]+/;
const duz = (x) => x.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i").replace(/[^a-z]/g, "");
const SURE_ANAHTARLARI = SURE_ADLARI.map(([slug, ad]) => [duz(slug), duz(ad), duz(ad.toLowerCase().replace(TAKI, ""))]);
/** «2:255», «2 255», «bakara 255», «al-baqarah:255», «2», «bakara» → {s, a} | {s} | {hata}; boşsa null. */
const ayeteGit = (metin) => {
  const q = metin.trim();
  if (!q) return null;
  const m = /^(\d{1,3}|\D+?)[\s:./-]*(\d{1,3})?$/.exec(q);
  if (!m) return { hata: true };
  let s = Number(m[1]);
  if (!/^\d/.test(m[1])) {
    const ad = duz(m[1].toLowerCase().replace(TAKI, ""));
    const i = ad ? SURE_ANAHTARLARI.findIndex((k) => k.includes(ad)) : -1;
    s = (i >= 0 ? i : SURE_ANAHTARLARI.findIndex((k) => ad && k.some((x) => x.startsWith(ad)))) + 1;
  }
  if (!(s >= 1 && s <= 114)) return { hata: true };
  if (m[2] === undefined) return { s };
  const a = Number(m[2]);
  return a >= 1 && a <= AYET_SAYILARI[s - 1] ? { s, a } : { hata: true };
};
// --- sayfa bitir ---

// --- snippet başla ---
// 1.13.0 (o170): kasadaki `.obsidian/snippets/linkedquran.css` sitedeki güncel kopyayla (`kasaCss()`, statik
// `/obsidian/linkedquran/linkedquran.css`) karşılaştırılır. Kişinin iki boyut değişkeni yalnız dosyanın ilk
// `body { … }` bloğunda okunur ve yeni kopyaya yazılır: `.lq-arabic-small` gibi boyut sınıfları aynı adları tanımlar.
const SNIPPET_BASI = "/* Linked Quran — Obsidian vault styling.";
const GOVDE = /^body \{\n[\s\S]*?\n\}/m;
const DEGISKEN = /(--lq-(?:arabic|word))(\s*:\s*)([^;\n]*);/g;
/** Bayatsa yazılacak metin (yeni kopya, eskinin değişken değerleriyle), değilse `null`. */
const snippetYenile = (eski, yeni) => {
  const d = Object.fromEntries([...(GOVDE.exec(eski)?.[0] ?? "").matchAll(DEGISKEN)].map((m) => [m[1], m[3]]));
  const sonuc = yeni.replace(GOVDE, (g) => g.replace(DEGISKEN, (t, ad, ara) => (ad in d ? `${ad}${ara}${d[ad]};` : t)));
  return sonuc === eski ? null : sonuc;
};
// --- snippet bitir ---

const METIN = {
  tr: {
    ad: "Linked Quran",
    gonder: "Şimdi eşitle",
    gezgin: "Sure gezginini aç",
    gezginBos: "Bu kasada sure sayfası yok.",
    ayeteGit: "Ayete git",
    ayeteGitIpucu: "Ayete git: 2:255 ya da bakara 255",
    devam: "Kaldığın yer",
    ayetYok: "Böyle bir ayet yok.",
    sureKasadaYok: "kasada yok; «Eksik sureleri ekle» komutuyla eklenir.",
    anahtar: "Senkron anahtarı",
    anahtarAcikla: "linkedquran.com/hesap → Senkron → anahtar üret, buraya yapıştır.",
    adres: "Site adresi",
    adresAcikla: "Değiştirmen gerekmez.",
    anahtarYok: "Linked Quran: önce eklenti ayarına senkron anahtarını yapıştır.",
    sureYok: "Linked Quran: kasada Linked Quran sure dosyası bulunamadı.",
    gecersiz: "Linked Quran: anahtar geçersiz. linkedquran.com/hesap'tan yeni anahtar üretip buraya yapıştır.",
    hata: (k) => `Linked Quran: eşitlenemedi (${k}). Bir sonraki değişiklikte yeniden denenecek.`,
    uyari: (u) => `Linked Quran: notlar gitti, ama uyarı var:\n${u}`,
    tamam: (saat, n) => `Linked Quran ✓ ${saat} · ${n} not`,
    cakisma: (n) => `${n} çakışma`,
    yetkiYok: "yayım yetkin yok",
    toplu: "toplu silme durdu",
    bekliyor: (n) => `${n} sayfa bekliyor`,
    // 1.11.0 site metni (o166)
    tazele: "Site metnini yenile (bütün sureler)",
    tazeleEvet: "Yenile",
    metinBaslik: "Kasadaki metin",
    metinAcikla: "Mealler, kelime meali ve Arapça sure sayfalarına siteden yazılır. Seçip bu ekranı kapatınca kasada olmayan sureler (114'ün hepsi) indirilir; seçimi sonradan değiştirince var olan sayfaların yenilenmesi sorulur. Açtığın sure sayfası da haftada bir kendiliğinden yenilenir. Notların ve taslakların değişmez.",
    mealler: "Mealler (en çok 5, sekme sırası)",
    mealEkle: "Meal ekle",
    kaldir: "Kaldır",
    kelime: "Kelime meali",
    yok: "Yok",
    arapca: "Arapça",
    katalogYok: "Meal listesi yüklenemedi (çevrimdışı mı?).",
    ayarOkunamadi: (p) => `Linked Quran: sayfalarındaki mealler katalogda tek bir meale denk gelmedi${p ? ` («${p}»)` : ""}. Eklenti ayarından mealleri seç.`,
    tazeleOzet: (n, mealler, kelime, arapca) =>
      `${n} sure sayfasının site metni yenilenecek: ${[arapca ? "Arapça" : null, kelime ? `kelime meali (${kelime})` : null, ...mealler].filter(Boolean).join(", ") || "metinsiz"}. Notların, taslakların ve kendi mealin değişmez.`,
    tazeleBitti: (y, a, atlanan) => `Linked Quran: ${y} sayfa yenilendi, ${a} sayfa zaten günceldi.${atlanan.length ? `
Yazılmayan: ${atlanan.join(" · ")}` : ""}`,
    snippetYenilendi: "Linked Quran: kasanın görünüm dosyası (linkedquran.css) güncellendi; eskisi linkedquran.css.bak.",
    // 1.16.0 eklentiyle kurulum (o185)
    sureEkle: "Eksik sureleri ekle",
    sureEkleMealYok: "Linked Quran: önce eklenti ayarında «Kasadaki metin»den mealleri seç.",
    eksikYok: "Linked Quran: kasada 114 surenin hepsi var.",
    eksikBitti: (y, kalan, neden) => `Linked Quran: ${y} sure eklendi.${kalan ? ` ${kalan} sure eklenemedi (${neden}); «Eksik sureleri ekle» ile yeniden dene.` : ""}`,
    neden: (k) => ({ hiz_siniri: "saatlik istek sınırı doldu, bir saat sonra", kaynak_yuklenemedi: "kelime meali kaynağı şu an yüklenemiyor" })[k] ?? k,
    baskaHesap: "Bu kasa başka bir hesaba bağlanacak: bağlantıdaki anahtar kayıtlı senkron anahtarının yerine yazılır.",
    bagla: "Bağla",
    baglandi: "Linked Quran: kasa hesabına bağlandı. Mealleri seçip ayar ekranını kapat; sureler indirilir.",
  },
  en: {
    ad: "Linked Quran",
    gonder: "Sync now",
    gezgin: "Open surah navigator",
    gezginBos: "No surah pages in this vault.",
    ayeteGit: "Go to verse",
    ayeteGitIpucu: "Go to verse: 2:255 or baqarah 255",
    devam: "Continue",
    ayetYok: "No such verse.",
    sureKasadaYok: "not in this vault; add it with «Add missing surahs».",
    anahtar: "Sync key",
    anahtarAcikla: "linkedquran.com/hesap → Sync → generate a key, paste it here.",
    adres: "Site address",
    adresAcikla: "No need to change this.",
    anahtarYok: "Linked Quran: paste your sync key into the plugin settings first.",
    sureYok: "Linked Quran: no Linked Quran surah file found in this vault.",
    gecersiz: "Linked Quran: the key is invalid. Generate a new one at linkedquran.com/hesap and paste it here.",
    hata: (k) => `Linked Quran: could not sync (${k}). Will retry on the next change.`,
    uyari: (u) => `Linked Quran: notes sent, with warnings:\n${u}`,
    tamam: (saat, n) => `Linked Quran ✓ ${saat} · ${n} note${n === 1 ? "" : "s"}`,
    cakisma: (n) => `${n} conflict${n === 1 ? "" : "s"}`,
    yetkiYok: "no publishing permission",
    toplu: "bulk delete stopped",
    bekliyor: (n) => `${n} page${n === 1 ? "" : "s"} waiting`,
    // 1.11.0 site text (o166)
    tazele: "Refresh site text (all surahs)",
    tazeleEvet: "Refresh",
    metinBaslik: "Text in your vault",
    metinAcikla: "Translations, word by word and Arabic are written into your surah pages from the site. Choose them and close this screen to download the surahs missing from your vault (all 114); change them later and you are asked to refresh the existing pages. A surah page you open also refreshes itself once a week. Your notes and drafts don't change.",
    mealler: "Translations (up to 5, in tab order)",
    mealEkle: "Add a translation",
    kaldir: "Remove",
    kelime: "Word by word",
    yok: "None",
    arapca: "Arabic",
    katalogYok: "Could not load the translation list (offline?).",
    ayarOkunamadi: (p) => `Linked Quran: the translations on your pages didn't match exactly one catalog entry${p ? ` («${p}»)` : ""}. Choose them in the plugin settings.`,
    tazeleOzet: (n, mealler, kelime, arapca) =>
      `The site text of ${n} surah page${n === 1 ? "" : "s"} will be refreshed: ${[arapca ? "Arabic" : null, kelime ? `word by word (${kelime})` : null, ...mealler].filter(Boolean).join(", ") || "no text"}. Your notes, drafts and own translation don't change.`,
    tazeleBitti: (y, a, atlanan) => `Linked Quran: ${y} page${y === 1 ? "" : "s"} refreshed, ${a} already up to date.${atlanan.length ? `\nNot written: ${atlanan.join(" · ")}` : ""}`,
    snippetYenilendi: "Linked Quran: the vault's style snippet (linkedquran.css) was updated; the old one is linkedquran.css.bak.",
    // 1.16.0 setup from the plugin (o185)
    sureEkle: "Add missing surahs",
    sureEkleMealYok: "Linked Quran: choose your translations under «Text in your vault» in the plugin settings first.",
    eksikYok: "Linked Quran: all 114 surahs are already in this vault.",
    eksikBitti: (y, kalan, neden) => `Linked Quran: ${y} surah${y === 1 ? "" : "s"} added.${kalan ? ` ${kalan} not added (${neden}); run «Add missing surahs» to retry.` : ""}`,
    neden: (k) => ({ hiz_siniri: "hourly request limit reached, try again in an hour", kaynak_yuklenemedi: "word-by-word source unavailable" })[k] ?? k,
    baskaHesap: "This vault will be connected to a different account: the link's key replaces the saved sync key.",
    bagla: "Connect",
    baglandi: "Linked Quran: vault connected to your account. Choose your translations and close the settings; the surahs will be downloaded.",
  },
};

// --- incelt başla --- (test:kasa bu bloğu okuyup sınıyor)
// Sunucunun okumadığı gönderilmez (o95: kelime mealli kasa 31 MB, sınır
// 20 MB): ilk `## N`'den önceki baş (katman çubuğu) ve her bölümün
// başındaki ayet kutusu — `kasaOku` ikisini de atıyor.
const incelt = (x) => {
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(x)?.[0] ?? "";
  const govde = x.slice(fm.length);
  const ilk = govde.search(/^## \d{1,3}[ \t]*\r?$/m);
  return fm + (ilk < 0 ? "" : govde.slice(ilk)).replace(
    /(^## \d{1,3}[ \t]*\r?\n(?:[ \t]*\r?\n)*)> \[!(?:verse|ayet)\][^\n]*\n(?:>[^\n]*(?:\n|$))*/gm, "$1");
};
// Yalnız kasa klasörünün sure dosyaları (o107, kullanıcı kararı «Eklenti yalnız
// Linked Quran/ klasörüne baksın»): kasadaki başka araçların aynı `type`lı
// dosyaları gitmez. İkinci kol: kök kasa klasörünün kendisi (Action reposu).
const KASA_YOLU = /(?:^|\/)Linked Quran\/(?:Surahs|Sureler)\/[^/]+\.md$|^(?:Surahs|Sureler)\/[^/]+\.md$/;
// --- incelt bitir ---

// --- yerlestir başla --- (test:kasa bu bloğu okuyup sınıyor)
// Kasa biçimi 2'nin eklentideki eşi (src/lib/obsidian-kasa.ts `bolumOku`,
// `kullaniciBolgesi`). Bir ayetin bölgesi `^s-a` blok kimliğinden (yoksa ayet
// kutusundan, o da yoksa `## N`'den) sonra başlar, sonraki `## M`'ye kadar sürer.
const BASLIK = /^## (\d{1,3})[ \t]*$/;
const ISARET = /^%% linkedquran: (.*?) %%[ \t]*$/;
const NOT_ISARETI = /^note (\d{1,18}) · v(\d{1,9}) · (draft|pending|published|rejected)$/;
const MEAL_ISARETI = /^translation · (\S+)$/;
const DURUM = { draft: "taslak", pending: "beklemede", published: "yayimda", rejected: "reddedildi" };
const kirp = (x) => x.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");

/** Frontmatter'ın düz `ad: "değer"` alanları (önbelleği olmayan dosya için). */
const fmOku = (x) => {
  const o = {};
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(x)?.[1] ?? "";
  for (const s of fm.split(/\r?\n/)) {
    const m = /^(\w+):[ \t]*"?([^"]*?)"?[ \t]*$/.exec(s);
    if (m) o[m[1]] = m[2];
  }
  return o;
};

/** Satırlar: baş (frontmatter + ilk `## N`'e kadar) ve `## N` bölümleri. */
const parcala = (icerik) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const fmSon = satirlar[0] === "---" ? satirlar.indexOf("---", 1) + 1 : 0;
  const bas = [];
  const bolumler = [];
  satirlar.forEach((s, i) => {
    const m = i >= fmSon && BASLIK.exec(s);
    if (m) bolumler.push({ a: Number(m[1]), satirlar: [s] });
    else (bolumler.at(-1)?.satirlar ?? bas).push(s);
  });
  return { bas, bolumler };
};

/** Bölümde kullanıcı bölgesinin başladığı satır: başlık, ayet kutusu, blok kimliği sitenin. */
const sinir = (satirlar) => {
  let i = 1;
  let son = 1;
  const bosAtla = () => {
    while (i < satirlar.length && satirlar[i].trim() === "") i++;
  };
  bosAtla();
  if (/^> \[!(?:verse|ayet)\]/.test(satirlar[i] ?? "")) {
    while (i < satirlar.length && satirlar[i].startsWith(">")) i++;
    son = i;
    bosAtla();
  }
  if (/^\^\d{1,3}-\d{1,3}$/.test(satirlar[i] ?? "")) son = ++i;
  return son;
};

/** Bölge satırları → meal (işaret zamanı, metin) ve not işaretleri. */
const bolgeOku = (satirlar) => {
  let i = 0;
  let zaman;
  let meal = null;
  for (;;) {
    while (i < satirlar.length && satirlar[i].trim() === "") i++;
    const s = satirlar[i] ?? "";
    const m = MEAL_ISARETI.exec(ISARET.exec(s)?.[1] ?? "");
    if (m) {
      zaman = m[1];
      i++;
    } else if (/^> \[!(?:own-translation|kendi-meal)\]/.test(s)) {
      const al = [];
      for (i++; i < satirlar.length && satirlar[i].startsWith(">"); i++) al.push(satirlar[i].replace(/^> ?/, ""));
      meal = kirp(al.join("\n"));
    } else break;
  }
  const notlar = [];
  for (const s of satirlar.slice(i)) {
    const x = NOT_ISARETI.exec(ISARET.exec(s)?.[1] ?? "");
    if (x) notlar.push({ id: Number(x[1]), v: Number(x[2]), durum: DURUM[x[3]] });
  }
  return { zaman, meal, notlar };
};

/** Dosya → `## N` sayısı ve ayet başına meal + not işaretleri. */
const oku = (icerik) => {
  const { bolumler } = parcala(icerik);
  const ayetler = new Map();
  for (const b of bolumler) {
    const r = bolgeOku(b.satirlar.slice(sinir(b.satirlar)));
    const x = ayetler.get(b.a);
    if (x) x.notlar.push(...r.notlar);
    else ayetler.set(b.a, r);
  }
  return { k: bolumler.length, ayetler };
};

/**
 * Çekme yanıtının bir dosyası (`{bolgeler, tut, bos}`) dosyaya: `tut`taki
 * ayete dokunulmaz, yanıtta olmayan ayete `bos` yazılır, dosyada `## N`'i
 * olmayan bölge sırasına eklenir. Biçim `kasaYaz`ınkiyle aynı: aynı bölgeler
 * aynı dosyayı verir (yazma döngüsü yok).
 */
const yerlestir = (icerik, { bolgeler, tut = [], bos = "" }) => {
  const { bas, bolumler } = parcala(icerik);
  const tutulan = new Set(tut.map(Number));
  const gorulen = new Set();
  const bolum = (a, ust) => {
    // Aynı ayetin ikinci bölümü boşalır: bölge birinciye yazıldı.
    const r = gorulen.has(a) ? "" : (bolgeler[a] ?? bos);
    gorulen.add(a);
    return [...ust, ...(r ? ["", ...r.split("\n")] : []), ""];
  };
  const eklenecek = Object.keys(bolgeler).map(Number)
    .filter((a) => bolgeler[a] && !tutulan.has(a) && !bolumler.some((b) => b.a === a))
    .sort((x, y) => x - y);
  const parcalar = [bas];
  for (const b of bolumler) {
    while (eklenecek.length && eklenecek[0] < b.a) {
      const a = eklenecek.shift();
      parcalar.push(bolum(a, [`## ${a}`]));
    }
    parcalar.push(tutulan.has(b.a) ? b.satirlar : bolum(b.a, b.satirlar.slice(0, sinir(b.satirlar))));
  }
  for (const a of eklenecek) parcalar.push(bolum(a, [`## ${a}`]));
  const cikti = [];
  for (const p of parcalar) {
    if (cikti.length && cikti.at(-1) !== "") cikti.push("");
    cikti.push(...p);
  }
  return cikti.join("\n");
};

/** MD5 (UTF-8, onaltılık). Mobilde Node `crypto` yok, SubtleCrypto MD5 bilmiyor. */
const md5 = (metin) => {
  const b = new TextEncoder().encode(metin);
  const k = new Uint32Array((((b.length + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < b.length; i++) k[i >> 2] |= b[i] << ((i % 4) * 8);
  k[b.length >> 2] |= 0x80 << ((b.length % 4) * 8);
  k[k.length - 2] = (b.length * 8) >>> 0;
  k[k.length - 1] = Math.floor(b.length / 0x20000000);
  const T = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let j = 0; j < k.length; j += 16) {
    let [a, x, c, d] = h;
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      const f = r === 0 ? (x & c) | (~x & d) : r === 1 ? (d & x) | (~d & c) : r === 2 ? x ^ c ^ d : c ^ (x | ~d);
      const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const t = (a + f + T[i] + k[j + g]) | 0;
      const s = S[(r << 2) | (i & 3)];
      [a, x, c, d] = [d, (x + ((t << s) | (t >>> (32 - s)))) | 0, x, c];
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + x) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
  }
  return h.map((x) => [0, 8, 16, 24].map((s) => ((x >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
};

// --- yerlestir bitir ---

// --- tazele başla --- (test:kasa bu bloğu `yerlestir` bloğuyla birlikte okuyup sınıyor)
// Site metnini yenileme (1.11.0, o166; kullanıcı kararı 2026-10-18 «Dosyada kalsın, eklenti
// yenilesin»): sunucunun aynı sure için ürettiği dosyadan (`GET /api/lq/v1/kasa/{n}`, kullanıcı
// bölgeleri boş) başlık ve her ayetin `^s-a`'ya kadar olan site dilimi alınır; kullanıcı bölgesi
// satır satır yerinde kalır. o154 geçiş betiğinin (`data/out/o154/gecir.mjs`) eklentideki eşi.
// Frontmatter değerle karşılaştırılır (Obsidian'ın Properties düzenleyicisi biçimi değiştirir):
// değerler aynıysa yerel satırlar kalır, böylece fark yokken dosyaya dokunulmaz.
const FM_ALANLARI = ["type", "lq_schema", "lq_download", "surah", "template", "text_source", "aliases", "tags", "cssclasses"];
/** Eski kasanın anahtarları (o107 öncesi Türkçe, o150 öncesi `lq_sema`; `ESKI_ANAHTAR` eşi): okunur, sunucunun adıyla yazılır. */
const ESKI_ALAN = { tur: "type", sure: "surah", kalip: "template", metin_kaynagi: "text_source", lq_indirme: "lq_download", lq_sema: "lq_schema" };
/** Kişinin de eklediği listeler: sunucunun değerleri önce, kişinin ekledikleri kalır (plan-reviewer sapma o166 #3). */
const BIRLESEN = ["tags", "aliases"];
/** Frontmatter satırları ve düz değerleri: skaler, blok `- x` ve satır içi `[a, b]` listesi (`frontmatterOku` eşi). */
const fmAyir = (satirlar) => {
  if (satirlar[0] !== "---") return { satirlar: [], alanlar: new Map(), govde: satirlar };
  const son = satirlar.indexOf("---", 1);
  const skaler = (x) => {
    const t = x.trim();
    if (t.startsWith('"')) {
      try {
        return JSON.parse(t);
      } catch {
        return t;
      }
    }
    return t.startsWith("'") && t.endsWith("'") && t.length >= 2 ? t.slice(1, -1).replace(/''/g, "'") : t;
  };
  const alanlar = new Map();
  let liste = null;
  for (const s of satirlar.slice(1, son)) {
    const madde = /^\s*-\s+(.*)$/.exec(s);
    if (madde && liste) {
      liste.push(skaler(madde[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(s);
    if (!kv) continue;
    const ic = kv[2].trim();
    liste = null;
    if (ic === "") alanlar.set(kv[1], (liste = []));
    else if (/^\[.*\]$/.test(ic)) alanlar.set(kv[1], ic.slice(1, -1).trim() === "" ? [] : (ic.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+/g) ?? []).map(skaler));
    else alanlar.set(kv[1], skaler(ic));
  }
  return { satirlar: satirlar.slice(0, son + 1), alanlar, govde: satirlar.slice(son + 1) };
};
/** `lq-k-x` (o150 öncesi) → `lq-x`. */
const yeniAd = (c) => String(c).replace(/^lq-k-/, "lq-");
/** Başlıktaki Layers kutusunun metin katmanları: sınıf → etiket (boyut çiftleri hariç). */
const rehberMetin = (satirlar) => {
  const r = new Map();
  for (const s of satirlar) {
    const m = /`(lq-[\w-]+)`\s+—\s+(.+?)\s*$/.exec(s);
    if (m && !/^lq-(?:k-)?(?:arabic|meaning)-(?:small|large)$/.test(m[1])) r.set(yeniAd(m[1]), m[2]);
  }
  return r;
};
/** Sitenin başlık satırı mı: boş, `# Ad`, gezinme (`[[…]]`), callout. Başka satır elle yazılmıştır. */
const basSatiri = (s) => s.trim() === "" || /^# /.test(s) || s.startsWith(">") || /^(?:← )?\[\[.*\]\]/.test(s);
/** Ayet → kullanıcı bölgesi metni (boş olanlar hariç); kapı 1. */
const bolgeler = (b) => JSON.stringify(b.map((x) => [x.a, x.satirlar.slice(sinir(x.satirlar)).join("\n")]).filter(([, r]) => r.trim() !== ""));
/** `oku` sonucu, notu ya da meali olan ayetler; kapı 2. */
const okunan = (x) => JSON.stringify([...oku(x).ayetler].filter(([, r]) => r.meal !== null || r.notlar.length));

/**
 * Yerel sure dosyası + sunucunun metni → `{metin, degisti}` ya da `{kod}` (yazılmaz).
 * Kodlar: `sure_farkli` · `bilinmeyen_alan:<ad>` · `baslik_elle` · `bolge_kapisi` · `oku_kapisi`.
 */
const tazele = (yerel, sunucu) => {
  const y = parcala(yerel);
  const s = parcala(sunucu);
  const yf = fmAyir(y.bas);
  const sf = fmAyir(s.bas);
  const eskiAd = [...yf.alanlar.keys()].some((k) => k in ESKI_ALAN);
  yf.alanlar = new Map([...yf.alanlar].map(([k, v]) => [ESKI_ALAN[k] ?? k, v]));
  if (String(yf.alanlar.get("surah")) !== String(sf.alanlar.get("surah"))) return { kod: "sure_farkli" };

  const bilinmeyen = [...yf.alanlar.keys()].find((k) => !FM_ALANLARI.includes(k));
  if (bilinmeyen) return { kod: `bilinmeyen_alan:${bilinmeyen}` };
  if (!yf.govde.every(basSatiri)) return { kod: "baslik_elle" };

  // cssclasses: kapalı katman kapalı kalır — etiketiyle (meal sırası değişse de aynı meal kapalı).
  const yerelHam = [].concat(yf.alanlar.get("cssclasses") ?? []).map(String);
  const yerelSinif = yerelHam.map(yeniAd);
  const eskiRehber = rehberMetin(yf.govde);
  const yeniRehber = rehberMetin(sf.govde);
  const kapali = new Set([...eskiRehber].filter(([c]) => !yerelSinif.includes(c)).map(([, et]) => et));
  const sunucuSinif = [].concat(sf.alanlar.get("cssclasses") ?? []);
  const sinifler = [
    ...sunucuSinif.filter((c) => (yeniRehber.has(c) ? !kapali.has(yeniRehber.get(c)) : c === "linkedquran" || yerelSinif.includes(c))),
    ...yerelSinif.filter((c) => !sunucuSinif.includes(c) && !eskiRehber.has(c) && !yeniRehber.has(c)),
  ];
  const ayni = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const kume = (l) => [...new Set(l)].sort();
  const liste = (m, k) => [].concat(m.get(k) ?? []).map(String);
  const listeler = { cssclasses: sinifler };
  for (const k of BIRLESEN) listeler[k] = [...liste(sf.alanlar, k), ...liste(yf.alanlar, k).filter((x) => !liste(sf.alanlar, k).includes(x))];
  const fmAyni = !eskiAd && FM_ALANLARI.every((k) =>
    k === "lq_download" ? true
    : k === "cssclasses" ? ayni(kume(yerelHam), kume(sinifler))
    : BIRLESEN.includes(k) ? ayni(kume(liste(yf.alanlar, k)), kume(listeler[k]))
    : ayni(yf.alanlar.get(k) ?? null, sf.alanlar.get(k) ?? null));
  let fm = yf.satirlar;
  if (!fmAyni) {
    // Sunucunun satırları; `lq_download` yerelden (içe aktarımın çakışma koruması), sınıflar birleşik.
    fm = [];
    let atla = false;
    for (const x of sf.satirlar) {
      if (atla && /^\s*-\s/.test(x)) continue;
      atla = false;
      const ad = /^(\w+):$/.exec(x)?.[1];
      if (ad && listeler[ad]) {
        fm.push(`${ad}:`, ...listeler[ad].map((c) => `  - ${JSON.stringify(c)}`));
        atla = true;
        continue;
      }
      fm.push(x);
      if (/^lq_schema:/.test(x) && yf.alanlar.has("lq_download")) fm.push(`lq_download: ${JSON.stringify(String(yf.alanlar.get("lq_download")))}`);
    }
  }

  const site = new Map();
  for (const b of s.bolumler) if (!site.has(b.a)) site.set(b.a, b.satirlar);
  const yereldeki = new Set(y.bolumler.map((b) => b.a));
  const eklenecek = [...site.keys()].filter((a) => !yereldeki.has(a)).sort((p, q) => p - q);
  const govde = [];
  const gorulen = new Set();
  for (const b of y.bolumler) {
    while (eklenecek.length && eklenecek[0] < b.a) govde.push(...site.get(eklenecek.shift()));
    const n = site.get(b.a);
    // Aynı ayetin ikinci bölümü ve sunucuda olmayan ayet olduğu gibi kalır.
    govde.push(...(n && !gorulen.has(b.a) ? [...n.slice(0, sinir(n)), ...b.satirlar.slice(sinir(b.satirlar))] : b.satirlar));
    gorulen.add(b.a);
  }
  for (const a of eklenecek) govde.push(...site.get(a));
  const metin = [...fm, ...sf.govde, ...govde].join("\n");

  const z = parcala(metin);
  if (bolgeler(z.bolumler) !== bolgeler(y.bolumler)) return { kod: "bolge_kapisi" };
  if (okunan(metin) !== okunan(yerel)) return { kod: "oku_kapisi" };
  return { metin, degisti: metin !== yerel };
};

/**
 * Eski kasanın ayarı (o154 `gecir.mjs` eşleştirmesi): `text_source` → `{arapca, kelime, mealler}`.
 * Meal etiketi `kasaDosyalari`'nınki: «ad · baskı (kaynak)». Her parça katalogda tam BİR etiketle
 * eşleşmeli; eşleşmeyen ya da birden fazla eşleşen varsa `{kod}` (ayar elle seçilir). Kelime meali quran.com
 * (`en`/`tr`) ya da `kaynaklar`dan (`dizin.json` `kelimeKaynaklari`, 1.16.0) adıyla tanınan kaynağın slug'ı.
 */
const ayarCikar = (kaynak, katalog, kaynaklar = []) => {
  let r = String(kaynak ?? "");
  const arapca = /(?:^| · )Arabic: [^·]*/.test(r);
  const k = /(?:^| · )Word by word \((EN|TR)\): ([^·]*?)(?= · |$)/.exec(r);
  let kelime = "";
  if (k) {
    const x = kaynaklar.find((t) => `${t.name} (${t.source_name}); quran.com where it does not align` === k[2]);
    if (k[2] !== "quran.com" && !x) return { kod: "eslesmedi", parca: k[0].replace(/^ · /, "").slice(0, 80) };
    kelime = x?.slug ?? k[1].toLowerCase();
  }
  r = r.replace(/(?:^| · )Arabic: [^·]*?(?= · |$)/, "").replace(k?.[0] ?? "", "").replace(/^ · /, "");
  const etiket = (t) => `${t.name}${t.edition ? ` · ${t.edition}` : ""} (${t.source_name})`;
  const mealler = [];
  for (let p = 0; p < r.length; ) {
    const aday = katalog.filter((t) => {
      const son = p + etiket(t).length;
      return r.startsWith(etiket(t), p) && (son === r.length || r.startsWith(" · ", son));
    });
    if (aday.length !== 1) return { kod: aday.length ? "belirsiz" : "eslesmedi", parca: r.slice(p, p + 80) };
    mealler.push(aday[0].slug);
    p += etiket(aday[0]).length + 3;
  }
  return { arapca, kelime, mealler };
};
// --- tazele bitir ---

// --- yayim başla --- (test:kasa bu bloğu okuyup sınıyor; `yerlestir` bloğunun adlarını kullanır)
// Ayet kartının parçaları (kasa biçimi 2, `sinir`/`bolgeOku` ile aynı kurallar).
// Satır numaraları dosyanın satırlarında, 0'dan.
const AYRAC = "%% linkedquran: published %%";
const SONRAKI_NOT = "%% linkedquran: next note %%";
const isaretSatiri = (s) => ISARET.test(s);
const notIsareti = (s) => NOT_ISARETI.exec(ISARET.exec(s)?.[1] ?? "");
// 1.17.0 (Dilim 2c): sitede sonradan değişen taslağın ve kendi mealin sitedeki hâli, kasadakinin yanında ikinci blok.
const sitedeIsareti = (id) => `%% linkedquran: on site now · note ${id} %%`;
const sitedeId = (s) => Number(/^on site now · note (\d{1,18})$/.exec(ISARET.exec(s ?? "")?.[1] ?? "")?.[1]) || null;
const MEAL_SITEDE = "%% linkedquran: translation on site now %%";

/**
 * `## N` bölümleri: `kutuSon` ayet kutusunun son satırından sonrası (kutu yoksa
 * -1), `bolge` kullanıcı bölgesinin ilk satırı (`^s-a`'dan sonra), `taslak`
 * kendi meal kutusundan sonra Taslak alanının ilk satırı, `ayrac` yayın ayracı
 * (yoksa -1), `son` bölümün son satırı.
 */
const kartlar = (satirlar) => {
  const fmSon = satirlar[0] === "---" ? satirlar.indexOf("---", 1) + 1 : 0;
  const basliklar = [];
  for (let i = fmSon; i < satirlar.length; i++) {
    const m = BASLIK.exec(satirlar[i]);
    if (m) basliklar.push([i, Number(m[1])]);
  }
  return basliklar.map(([b, a], k) => {
    const son = (basliklar[k + 1]?.[0] ?? satirlar.length) - 1;
    const bolge = b + sinir(satirlar.slice(b, son + 1));
    let kutuSon = -1;
    let i = b + 1;
    while (i <= son && satirlar[i].trim() === "") i++;
    if (/^> \[!(?:verse|ayet)\]/.test(satirlar[i] ?? "")) {
      while (i <= son && satirlar[i].startsWith(">")) i++;
      kutuSon = i;
    }
    i = bolge;
    for (;;) {
      while (i <= son && satirlar[i].trim() === "") i++;
      if (i <= son && MEAL_ISARETI.test(ISARET.exec(satirlar[i])?.[1] ?? "")) i++;
      else if (i <= son && /^> \[!(?:own-translation|kendi-meal)\]/.test(satirlar[i])) {
        while (i <= son && satirlar[i].startsWith(">")) i++;
      } else break;
    }
    const taslak = Math.min(i, son + 1);
    let ayrac = -1;
    for (let j = taslak; j <= son; j++) if (satirlar[j].trim() === AYRAC) { ayrac = j; break; }
    return { a, baslik: b, kutuSon, bolge, taslak, ayrac, son };
  });
};

/** Satır aralığında işaret olmayan dolu satır var mı. */
const dolu = (satirlar, bas, son) => satirlar.slice(bas, son + 1).some((s) => s.trim() !== "" && !isaretSatiri(s));

/** Kartın başlık bilgisi: Taslak alanı dolu mu; Yayın alanı dolu mu ve ilk not işaretinin durumu. */
const kartDurumu = (satirlar, k) => {
  const taslakSon = k.ayrac >= 0 ? k.ayrac - 1 : k.son;
  let durum = null;
  if (k.ayrac >= 0) {
    for (let j = k.ayrac + 1; j <= k.son && !durum; j++) durum = notIsareti(satirlar[j])?.[3] ?? null;
  }
  return { taslak: dolu(satirlar, k.taslak, taslakSon), yayin: k.ayrac >= 0 && dolu(satirlar, k.ayrac + 1, k.son), durum };
};

/**
 * Publish: ayetin Taslak alanındaki notları (işaretleriyle) Yayın alanının
 * sonuna taşır, ayraç yoksa açar. Sunucu Yayın alanındaki taslağı yayımlar ya
 * da incelemeye gönderir (o109, rol sunucuda). Alan boşsa metin aynen döner.
 * İşaretsiz not önceki Yayın notuna yapışmasın diye arada `next note`.
 */
/**
 * Taslak alanı Publish'te ikiye: `tasinan` Yayın'a gider, `kalan` Taslak'ta kalır. 1.17.0 (kullanıcı kararı o188
 * «Yalnız benimki»): sitedeki meal farkı ve kartta kendi sürümü duran notun «on site now» bloğu başvuru olarak kalır;
 * yalnız kasadaki sürüm gider (sitede ikiz not çıkmasın).
 */
const taslakAyir = (satirlar, k) => {
  const taslakSon = k.ayrac >= 0 ? k.ayrac - 1 : k.son;
  const taslakBloklari = bloklar(satirlar.slice(k.taslak, taslakSon + 1));
  const kartIdleri = new Set(bloklar(satirlar.slice(k.taslak, k.son + 1)).map(blokId).filter(Boolean));
  const kalir = (b) => b.isaret === MEAL_SITEDE || kartIdleri.has(sitedeId(b.isaret));
  const kalan = taslakBloklari.filter(kalir).map(blokYaz).join("\n\n");
  const tasinan = kalan ? taslakBloklari.filter((b) => !kalir(b)).map(blokYaz).filter(Boolean).join("\n\n")
    : kirp(satirlar.slice(k.taslak, taslakSon + 1).join("\n"));
  return { kalan, tasinan, yayimlanir: dolu(tasinan.split("\n"), 0, Infinity) };
};

const yayimaTasi = (icerik, a) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const k = kartlar(satirlar).find((x) => x.a === a);
  if (!k) return icerik;
  const { kalan, tasinan, yayimlanir } = taslakAyir(satirlar, k);
  if (!yayimlanir) return icerik;
  const yayin = k.ayrac >= 0 ? kirp(satirlar.slice(k.ayrac + 1, k.son + 1).join("\n")) : "";
  const ayrim = yayin && !notIsareti(tasinan.split("\n")[0]) ? [SONRAKI_NOT] : [];
  const bas = satirlar.slice(k.baslik, k.taslak);
  while (bas.length > 1 && bas.at(-1).trim() === "") bas.pop();
  const bolge = [...(kalan ? [kalan] : []), AYRAC, ...(yayin ? [yayin] : []), ...ayrim, tasinan].join("\n\n");
  return [...satirlar.slice(0, k.baslik), ...bas, "", ...bolge.split("\n"), "", ...satirlar.slice(k.son + 1)].join("\n");
};

/** Back to draft (1.5.0): `yayimaTasi`nın tersi — Yayın notları işaretleriyle Taslak'ın sonuna, ayraç kalkar. */
const taslagaTasi = (icerik, a) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const k = kartlar(satirlar).find((x) => x.a === a);
  if (!k || k.ayrac < 0) return icerik;
  const taslak = kirp(satirlar.slice(k.taslak, k.ayrac).join("\n"));
  const yayin = kirp(satirlar.slice(k.ayrac + 1, k.son + 1).join("\n"));
  const ayrim = taslak && yayin && !notIsareti(yayin.split("\n")[0]) ? [SONRAKI_NOT] : [];
  const bas = satirlar.slice(k.baslik, k.taslak);
  while (bas.length > 1 && bas.at(-1).trim() === "") bas.pop();
  const bolge = [...(taslak ? [taslak] : []), ...ayrim, ...(yayin ? [yayin] : [])].join("\n\n");
  return [...satirlar.slice(0, k.baslik), ...bas, ...(bolge ? ["", ...bolge.split("\n")] : []), "", ...satirlar.slice(k.son + 1)].join("\n");
};

// Yerel-öncelikli senkron (1.5.0). Sitede silinen notun kasadaki işareti: metin kalır.
const SILINDI = "%% linkedquran: deleted on site %%";

/** Bir alanın satırları → notlar: her not işaret satırıyla (varsa) başlar; `isaret` satırın kendisi. */
const bloklar = (satirlar) => {
  const b = [];
  for (const s of satirlar) {
    if (isaretSatiri(s)) b.push({ isaret: s.trim(), govde: [] });
    else if (b.length) b.at(-1).govde.push(s);
    else b.push({ isaret: null, govde: [s] });
  }
  return b;
};
const blokId = (x) => (x.isaret ? Number(notIsareti(x.isaret)?.[1]) || null : null);
const blokMetni = (x) => kirp(x.govde.join("\n"));
const blokYaz = (x) => kirp([...(x.isaret ? [x.isaret] : []), ...x.govde].join("\n"));

/** Kartın üç parçası: meal (kendi meal + işareti), Taslak alanı, Yayın alanı (ayraçsız). */
const alanlar = (satirlar, k) => {
  if (!k) return { meal: [], taslak: [], yayin: [] };
  const taslakSon = k.ayrac >= 0 ? k.ayrac - 1 : k.son;
  return {
    meal: satirlar.slice(k.bolge, k.taslak),
    taslak: satirlar.slice(k.taslak, taslakSon + 1),
    yayin: k.ayrac >= 0 ? satirlar.slice(k.ayrac + 1, k.son + 1) : [],
  };
};

/** Dosyanın Taslak ve Yayın alanlarındaki not kimlikleri. */
const alanIdleri = (icerik) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const r = { taslak: new Set(), yayin: new Set() };
  for (const k of kartlar(satirlar)) {
    const x = alanlar(satirlar, k);
    for (const alan of ["taslak", "yayin"]) for (const b of bloklar(x[alan])) if (blokId(b)) r[alan].add(blokId(b));
  }
  return r;
};

/**
 * Gönderilecek metin: her bölümden başlık, ayet kutusu, `^s-a` ve ayraçtan
 * sonrası (Yayın alanı). Kendi meal ve Taslak alanı kasada kalır (o145).
 * 1.17.0: Yayın'a taşınmış «on site now» bloğu, kartın Yayın'ında aynı not yoksa cihaz tabanındaki işaretini
 * (`taban`: id → [v, durum]) alır; sunucu onu yeni not saymaz. Taban bilmiyorsa ayrı not olarak gider.
 */
const yayinSuz = (icerik, taban = {}) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const kk = kartlar(satirlar);
  if (!kk.length) return satirlar.join("\n");
  const etiket = Object.fromEntries(Object.entries(DURUM).map(([e, d]) => [d, e]));
  const cikti = satirlar.slice(0, kk[0].baslik);
  for (const k of kk) {
    const yayin = k.ayrac >= 0 ? satirlar.slice(k.ayrac, k.son + 1) : [];
    const idler = new Set(bloklar(yayin).map(blokId).filter(Boolean));
    cikti.push(...satirlar.slice(k.baslik, k.bolge), "", ...yayin.map((s) => {
      const id = sitedeId(s);
      if (!id) return s;
      const t = idler.has(id) ? null : taban[id];
      if (t) idler.add(id);
      return t ? `%% linkedquran: note ${id} · v${t[0]} · ${etiket[t[1]] ?? "draft"} %%` : SONRAKI_NOT;
    }));
  }
  return cikti.join("\n");
};

const zamanSayi = (z) => Date.parse(z ?? "") || 0;

/**
 * Bir ayetin yeni bölgesi: yerel meal + Taslak, sunucunun Yayın'ı. Sunucu
 * bölgesi (`kullaniciBolgesi`) bütün notları taşır. Kurallar docs/veri-tasima.md
 * «1.5.0» ve «1.17.0». `t` surenin cihaz tabanı (`n` not id → [v, durum, a],
 * `mz` ayet → kasadaki meal zamanı, `sil` kasada silinenler); `t.sil` burada güncellenir.
 */
const bolgeKur = (satirlar, k, sunucu, bekleyen, a = 0, t = { n: {}, mz: {}, sil: { n: {}, m: {} } }) => {
  const yerel = alanlar(satirlar, k);
  const ss = ["## 0", "", ...sunucu.split("\n")];
  const sb = alanlar(ss, kartlar(ss)[0]);
  const sYayin = new Map(bloklar(sb.yayin).filter(blokId).map((b) => [blokId(b), b]));
  const sTaslak = new Map(bloklar(sb.taslak).filter(blokId).map((b) => [blokId(b), b]));
  const surum = (b) => Number(notIsareti(b.isaret)?.[2]) || 0;
  const yerelTaslak = bloklar(yerel.taslak);
  const yerelYayin = bloklar(yerel.yayin);
  const yereldeki = new Set(yerelTaslak.map(blokId).filter(Boolean));
  const yayindaki = new Set(yerelYayin.map(blokId).filter(Boolean));
  const kartta = new Set([...yereldeki, ...yayindaki]);
  const taslak = [];

  // Kendi meal (1.17.0): boş yuvaya sitedeki; kasada silineni sitede değişmedikçe yazılmaz; ikisi de varsa ve
  // sitedeki yeniyse yerel kalır, işaret zamanı tazelenir, sitedeki metin Taslak'ın başına ayrı blok.
  let meal = kirp(yerel.meal.join("\n"));
  const ym = bolgeOku(yerel.meal);
  const sm = bolgeOku(sb.meal);
  if (sm.meal === null || ym.meal !== null) delete t.sil.m[a];
  if (sm.meal !== null && ym.meal === null) {
    const silinen = t.sil.m[a] ?? t.mz[a];
    if (silinen !== undefined && zamanSayi(sm.zaman) <= zamanSayi(silinen)) t.sil.m[a] = silinen;
    else {
      delete t.sil.m[a];
      meal = kirp(sb.meal.join("\n"));
    }
  } else if (sm.meal !== null && zamanSayi(sm.zaman) > zamanSayi(ym.zaman)) {
    // İşaretsiz yerel meale de işaret yazılır: yoksa her çekme sitedekini yeni sayıp blok açardı.
    const isaret = `%% linkedquran: translation · ${sm.zaman} %%`;
    const satir = yerel.meal.findIndex((s) => MEAL_ISARETI.test(ISARET.exec(s)?.[1] ?? ""));
    meal = kirp((satir < 0 ? [isaret, ...yerel.meal] : yerel.meal.map((s, i) => (i === satir ? isaret : s))).join("\n"));
    if (sm.meal !== ym.meal) taslak.push({ isaret: MEAL_SITEDE, govde: [sm.meal] });
  }

  // 1.17.1 (kullanıcı kararı o188 «Yenisi yerine geçsin»): sitede yeniden değişen taslağın ve mealin eski «on site
  // now» bloğu yenisiyle değişir (eski blokta elle yapılan düzeltme gider).
  const yenilenen = new Set(yerelTaslak.filter((b) => {
    const s = sTaslak.get(blokId(b));
    return s && surum(s) > surum(b) && blokMetni(s) !== blokMetni(b);
  }).map(blokId));
  const mealYenilendi = taslak.some((b) => b.isaret === MEAL_SITEDE);
  for (const b of yerelTaslak) {
    const id = blokId(b);
    const sid = sitedeId(b.isaret);
    if (yenilenen.has(sid) || (mealYenilendi && b.isaret === MEAL_SITEDE)) continue;
    if (sid && !kartta.has(sid) && sTaslak.has(sid)) {
      // Yerel sürüm silinmiş: «on site now» bloğu notun işaretini devralır, metin kasadaki.
      kartta.add(sid);
      yereldeki.add(sid);
      taslak.push({ isaret: sTaslak.get(sid).isaret, govde: b.govde });
    } else if (id && sYayin.has(id)) {
      // 1. Sitede yayımlandı: aynı metin Yayın'da; farklıysa yerel metin işaretsiz taslak kalır.
      if (blokMetni(b) === blokMetni(sYayin.get(id))) continue;
      taslak.push({ isaret: taslak.length ? SONRAKI_NOT : null, govde: b.govde });
    } else if (id && sTaslak.has(id)) {
      // 2. İşaret tazelenir, metin yerel; sitede sonradan değiştiyse sitedeki metin altında ayrı blok (1.17.0).
      const s = sTaslak.get(id);
      taslak.push({ isaret: s.isaret, govde: b.govde });
      if (surum(s) > surum(b) && blokMetni(s) !== blokMetni(b)) taslak.push({ isaret: sitedeIsareti(id), govde: s.govde });
    } else if (id) taslak.push({ isaret: SILINDI, govde: b.govde }); // 3. sitede silindi
    else taslak.push(b);
  }
  for (const id of kartta) delete t.sil.n[id];
  for (const [id, b] of sTaslak) {
    if (yereldeki.has(id)) continue;
    // 4. Sitede yayımdan çıkan (geri çekilen, reddedilen) ya da bu cihazın bekleyen notu Taslak'a iner.
    if (yayindaki.has(id) || bekleyen.has(id)) {
      taslak.push(b);
      continue;
    }
    // 6. (1.17.0) Kasada olmayan site taslağı yazılır; bu cihazın bilip kasada silineni sitede yeni sürüm almadıkça
    // yazılmaz (`sil` cihaza özel: boş tabanlı yeni cihaz onu bir kez getirir).
    const silinen = t.sil.n[id]?.[0] ?? t.n[id]?.[0];
    if (silinen !== undefined && surum(b) <= silinen) t.sil.n[id] = [silinen, a];
    else {
      delete t.sil.n[id];
      taslak.push(b);
    }
  }
  for (const id in t.sil.n) if (t.sil.n[id][1] === a && !sTaslak.has(Number(id)) && !sYayin.has(Number(id))) delete t.sil.n[id];
  // 5. Yayın'daki not sitede yok: metin Taslak'ta kalır (Yayın'da kalsa yeniden yayımlanırdı).
  for (const b of yerelYayin) if (blokId(b) && !sYayin.has(blokId(b)) && !sTaslak.has(blokId(b))) taslak.push({ isaret: SILINDI, govde: b.govde });
  const yayin = kirp(sb.yayin.join("\n"));
  return [meal, taslak.map(blokYaz).filter(Boolean).join("\n\n"), yayin ? `${AYRAC}\n\n${yayin}` : ""]
    .filter(Boolean).join("\n\n");
};

/** Çekme (1.5.0): her ayetin bölgesi `bolgeKur`la, sonra `yerlestir`; `tut`taki ayete dokunulmaz. */
const birlestir = (icerik, { bolgeler, tut = [] }, bekleyen = new Set(), taban) => {
  const satirlar = icerik.replace(/\r\n/g, "\n").split("\n");
  const tutulan = new Set(tut.map(Number));
  const yerel = new Map();
  for (const k of kartlar(satirlar)) if (!yerel.has(k.a)) yerel.set(k.a, k);
  const yeni = {};
  for (const a of new Set([...yerel.keys(), ...Object.keys(bolgeler).map(Number)])) {
    if (!tutulan.has(a)) yeni[a] = bolgeKur(satirlar, yerel.get(a), bolgeler[a] ?? "", bekleyen, a, taban);
  }
  return yerlestir(icerik, { bolgeler: yeni, tut, bos: "" });
};

/** `/` menüsünün ilişkileri: kasa kelimesi + açıklama (sitedeki `etiketAciklamasi`, test:kasa eşitliği sınar). */
const ILISKILER = [
  ["explains", "B opens up what A leaves closed"],
  ["continues", "B carries on from where A stops"],
  ["qualifies", "B narrows A's general ruling"],
  ["exception", "B names a case that falls outside A's scope"],
  ["contrasts", "A and B form a deliberate opposing pair"],
  ["root", "read together to settle how a shared term is used"],
  ["parallel", "the same episode told elsewhere"],
  ["ruling", "the same matter regulated elsewhere"],
  ["wording", "both verses carry the same sequence of words"],
  ["subject", "no shared wording, only the same subject"],
  ["generalises", "B lifts A's particular case into a general principle"],
];

/** Atıfın ardındaki ilişki işareti; kelime bilinen bir ilişkiyse (site `ISARET_KALIBI` gibi, arada yalnız boşluk). */
const ILISKI_ISARETI = new RegExp(String.raw`\]\][ \t]*%%[ \t]*(${[...ILISKILER.map(([k]) => k), "generalizes", "unspecified"].join("|")})[ \t]*%%`, "gi");

/** `/3:7` ya da `/2:255-257` (satır başında ya da boşluktan sonra); geçersizse null. */
const egikTetik = (oncesi) => {
  const m = /(^|\s)\/(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(oncesi);
  if (!m) return null;
  const [s, a, b] = [Number(m[2]), Number(m[3]), m[4] === undefined ? null : Number(m[4])];
  if (s < 1 || s > 114 || a < 1 || (b !== null && b <= a)) return null;
  return { s, a, b, uzunluk: m[0].length - m[1].length };
};
// --- yayim bitir ---

// --- katman başla --- (test:kasa bu bloğu okuyup sınıyor)
// Siteden okunan katmanlar (1.6.0, o148): `GET /api/lq/v1/en/{n}` (`src/lib/lq-api.ts`),
// çerezsiz ziyaretçinin gördüğü veri, anahtarsız. Eklenti katmanı tanımaz: listeyi
// sırasıyla dolaşır, öğeyi `tur`a göre çizer; bilinmeyen tür düz metin + «Open on site»
// (sitede yeni katman eklenti güncellenmeden görünür). Açık olanlar sayfanın
// `cssclasses`ı `lq-<id>` (kullanıcı kararı o148 «A · Şeritler + cssclasses»; 1.8.0 öncesi kasada `lq-k-<id>`).
const LQ_API = 1;
const KATMAN_TAZE = 15 * 60_000; // ponytail: sabit; katman verisi seyrek değişir, «Sync now» beklemez
const KATMAN_DENEME = 60_000; // başarısız istekten sonra (çevrimdışı) yeniden deneme aralığı
const BILINEN_TUR = ["dugum", "iliski", "yazi", "metin", "rozet"];
/** Hiçbir ayette öğe yok — uç DB arızasında böyle döner (`sessizSayfala`). */
const katmanBos = (veri) => !Object.values(veri?.ayetler ?? {}).some((a) => Object.values(a).some((l) => l.length > 0));
const katmanTaze = (kayit, simdi) => !!kayit && simdi - kayit.zaman < KATMAN_TAZE;
/** Yanıt kaydedilir mi: sözleşme sürümü tutuyor ve dolu bir kaydı boşla ezmiyor (plan-reviewer o148 #2). */
const katmanKabul = (veri, eski) => veri?.api === LQ_API && Array.isArray(veri.katmanlar) && (!katmanBos(veri) || !eski || katmanBos(eski.veri));
/** Sayfanın açık katmanları: `cssclasses` (dizi ya da metin) içindeki `lq-<id>`; eski kasanın `lq-k-<id>`ı da (o150). */
const acikKatmanlar = (fm) => {
  const c = fm?.cssclasses;
  const l = Array.isArray(c) ? c : typeof c === "string" ? c.split(/[\s,]+/) : [];
  return new Set(l.flatMap((x) => (/^lq-(?:k-)?(.+)$/.exec(String(x)) ?? []).slice(1)));
};
/**
 * Bir ayetin şeritleri: liste sırasıyla, açık ve öğesi olan katmanlar; `rozet` ayet
 * başlığında (sitedeki muhkem yeri). İlişki öğeleri sitedeki gibi işleve (etiket) göre
 * tek satırda; bilinmeyen türde etiket gösterilmez (anlamı bilinmiyor), metin düz kalır.
 */
const seritler = (veri, a, acik) =>
  (veri?.katmanlar ?? [])
    .filter((k) => acik.has(k.id) && k.tur !== "rozet" && (veri.ayetler?.[a]?.[k.id]?.length ?? 0) > 0)
    .map((k) => {
      const bilinmeyen = !BILINEN_TUR.includes(k.tur);
      const satirlar = [];
      const grup = new Map();
      for (const o of veri.ayetler[a][k.id]) {
        if (k.tur === "iliski" && grup.has(o.etiket)) grup.get(o.etiket).ogeler.push(o);
        else {
          const s = { etiket: bilinmeyen ? undefined : o.etiket, ogeler: [o] };
          satirlar.push(s);
          if (k.tur === "iliski") grup.set(o.etiket, s);
        }
      }
      return { id: k.id, ad: k.ad, tur: k.tur, bilinmeyen, satirlar, roller: k.roller ?? [], kelime: k.kelime };
    });
/** Ayet başlığına giden rozetler: açık `rozet` türü katmanların bu ayetteki öğeleri. */
const rozetler = (veri, a, acik) =>
  (veri?.katmanlar ?? []).filter((k) => k.tur === "rozet" && acik.has(k.id)).flatMap((k) => veri.ayetler?.[a]?.[k.id] ?? []);
/** Sayfanın ham `cssclasses` listesi (dizi ya da metin). */
const sinifListesi = (fm) => {
  const c = fm?.cssclasses;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/[\s,]+/).filter(Boolean) : [];
};
/**
 * Layers kutusunun yazılı listesi (kasaYaz `katmanRehberi`: «lq-arabic — Arabic»): metin katmanları ve
 * boyut ayrı (1.10.0, o158). Kutunun kendisi okunur: kasanın biçimi değişmeden her kasada çalışır.
 */
const BOYUT_SINIFI = /^lq-(?:k-)?(arabic|meaning)-(?:small|large)$/;
const rehberGruplari = (satirlar) => {
  const metin = [];
  const boyut = [];
  for (const x of satirlar) {
    const m = /^\s*(lq-[\w-]+)\s+—\s+(.+?)\s*$/s.exec(x);
    if (m) (BOYUT_SINIFI.test(m[1]) ? boyut : metin).push([m[1], m[2]]);
  }
  return { metin, boyut };
};
/** Çip dokunuşu: `siniflar`dan biri listede → hepsi çıkar; yoksa ilki eklenir ve `dislar` çıkar (boyut çiftleri). */
const sinifCevir = (liste, siniflar, dislar = []) =>
  liste.some((x) => siniflar.includes(x))
    ? liste.filter((x) => !siniflar.includes(x))
    : [...liste.filter((x) => !dislar.includes(x)), siniflar[0]];
// --- katman bitir ---

// --- eylem başla --- (test:kasa bu bloğu okuyup sınıyor)
// Kasadan eylemler (1.7.0, `POST /api/lq/v1/eylem`): istenen durum biçiminde; çevrimdışında
// cihazdaki kuyruğa (kullanıcı kararı o149 «Kuyruğa alsın, bağlanınca göndersin»).
const EYLEM_COK = 50; // uçtaki tavan
const EYLEM_BAYT = 60_000; // uçtaki gövde sınırı 64 KB; uzun bildirimler sonraki isteğe kalır
const AYET_YAZIMI = /^\s*(\d{1,3})\s*:\s*(\d{1,3})\s*$/;
const ayetCoz = (x) => {
  const m = AYET_YAZIMI.exec(String(x ?? ""));
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 114 && Number(m[2]) >= 1 ? `${Number(m[1])}:${Number(m[2])}` : null;
};
const eylemHedefi = (x) => (x.tur === "destek" ? `d|${x.hedef}` : x.tur === "sinif" ? `s|${x.ayet}` : null);
/** Tek kural (plan-reviewer o149 #4): destek ve sınıf oyu aynı hedefte eskisinin yerini alır; gerisi sıraya. */
const kuyrugaEkle = (kuyruk, e) => {
  const h = eylemHedefi(e);
  return [...(h ? kuyruk.filter((x) => eylemHedefi(x) !== h) : kuyruk), e];
};
/** Bu istekte gidecekler: baştan, en çok 50 eylem ve ~60 KB (ilki her durumda; tek eylem sınırın çok altında). */
const gidecekler = (kuyruk) => {
  const g = [];
  let bayt = 0;
  for (const x of kuyruk.slice(0, EYLEM_COK)) {
    bayt += JSON.stringify(x).length;
    if (g.length && bayt > EYLEM_BAYT) break;
    g.push(x);
  }
  return g;
};
/** Yanıttan sonra: işlenenler (gönderilenin baştan `sonuclar` kadarı) düşer; istek sürerken eklenen ya da yerini alan kalır. */
const kuyruktanDus = (kuyruk, gonderilen, islenenSayisi) => {
  const islenen = new Set(gonderilen.slice(0, islenenSayisi));
  return kuyruk.filter((x) => !islenen.has(x));
};
/** Kişinin hâli: kuyruktaki son istek, yoksa sunucunun son söylediği (`durum`). */
const destekEtkin = (kuyruk, durum, ref) => {
  const q = kuyruk.findLast((x) => x.tur === "destek" && x.hedef === ref);
  return q ? q.istek : !!durum?.destek?.includes(ref);
};
const sinifEtkin = (kuyruk, durum, s, a) => {
  const q = kuyruk.findLast((x) => x.tur === "sinif" && x.ayet === `${s}:${a}`);
  return q ? q.istek : (durum?.sinif?.[a] ?? null);
};
/** Gösterilen sayı: uçtaki sayı, katman alınırkenki hâlden (`katmanda`) şimdiki hâle farkı kadar. */
const destekSayisi = (o, etkin, katmanda) => Math.max(0, (o.destek ?? 0) + (etkin ? 1 : 0) - (katmanda ? 1 : 0));
const sinifSayilari = (kimler, etkin, katmanda) => {
  const n = { muhkem: 0, mutesabih: 0 };
  for (const k of kimler ?? []) if (k.tur in n) n[k.tur]++;
  if (katmanda in n) n[katmanda] = Math.max(0, n[katmanda] - 1);
  if (etkin in n) n[etkin]++;
  return n;
};
/** Kelime aralığı (sitedeki `UyelikOnerForm.kelimeTikla`): ilk dokunuş başı, ikincisi sonu; kurulu aralıkta baştan. */
const kelimeSec = (aralik, k) => (!aralik || k < aralik[0] || (aralik[0] !== aralik[1] && k >= aralik[0]) ? [k, k] : [aralik[0], k]);
/** Öğede panel var mı: eylem kimliği olan düğüm/ilişki öğesi (yorum, okunuş, bilinmeyen tür yok). */
const panelli = (o, tur) => !!o.ref && (tur === "dugum" || tur === "iliski");
// --- eylem bitir ---

/** Katman önbelleği cihazda (IndexedDB; kullanıcı kararı o148 «Cihazda»): kasaya yazılmaz, eşlenmez. */
const katmanDeposu = (() => {
  if (typeof indexedDB === "undefined") return { al: async () => undefined, koy: async () => {} }; // test:kasa
  let db;
  const ac = () =>
    (db ??= new Promise((tamam, hata) => {
      const r = indexedDB.open("linkedquran", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("katman");
      r.onsuccess = () => tamam(r.result);
      r.onerror = () => hata(r.error);
    }));
  const is = (kip, fn) =>
    ac().then((d) => new Promise((tamam, hata) => {
      const t = d.transaction("katman", kip);
      const q = fn(t.objectStore("katman"));
      t.oncomplete = () => tamam(q.result);
      t.onerror = () => hata(t.error);
    }));
  return {
    al: (k) => is("readonly", (s) => s.get(k)).catch(() => undefined),
    koy: (k, v) => is("readwrite", (s) => s.put(v, k)).catch(() => {}),
  };
})();

/** Kasa İngilizce (o107): kartın metinleri. Site metinleriyle aynı. */
const KART = {
  not: "Your personal note",
  taslak: "Draft",
  yayin: "Publication",
  durum: { draft: "Waiting to sync", pending: "In review", published: "Published", rejected: "Rejected" },
  yayimla: "Publish",
  gonder: "Submit for review",
  onay: "This note will be published under your name and everyone will see it. Continue?",
  vazgec: "Cancel",
  yerTutucu: "Write your note here. Type /3:7 to add a verse and how it relates. It stays in this vault until you publish.",
  ilisiksiz: "no relation",
  geriAl: "Back to draft", // sitenin `tefsir_withdraw`ı
  silindi: "Deleted on site",
  sitedeTaslak: "Draft on site", // 1.17.0: Taslak alanında sitede de taslak olarak duran not
  sitede: "On site now", // sitede sonradan değişen taslağın sitedeki metni
  mealSitede: "Translation on site now",
  sitedeAc: "Open on site",
  cevrimdisi: (t) => `Offline · layers as of ${t}`,
  // Layers kutusunun grupları (1.10.0)
  katmanMetin: "Text",
  katmanSite: "linkedquran.com",
  katmanBoyut: "Size",
  surumEski: "Linked Quran: the site's layers changed format. Update the plugin to see them.",
  // 1.7.0 eylemler (sitedeki metinler, kasa İngilizce)
  destekci: (n) => (n === 1 ? "1 supporter" : `${n} supporters`),
  katil: "I agree",
  destekGeri: "Withdraw my support",
  bildir: "Report",
  ac: (h) => `Open ${h}`,
  // Katman kimliği → tekil ad («Suggest another verse for this ruling…»).
  tekil: { topics: "topic", rulings: "ruling", questions: "question", "word-study": "word study", actors: "actor" },
  uyeOner: (ad) => `Suggest another verse for this ${ad}…`,
  iliskiOner: "Suggest a relation…",
  anahtarIpucu: "To agree, report or suggest from here, paste your key in the plugin settings.",
  kuyrukta: "Queued · sends when online",
  kuyrukSayisi: (n) => (n === 1 ? "1 action queued" : `${n} actions queued`),
  cevrimdisiKuyruk: "You're offline. Linked Quran will send this when connected.",
  kuyrukGitti: (n) => (n === 1 ? "Linked Quran: 1 queued action sent." : `Linked Quran: ${n} queued actions sent.`),
  uygulanamadi: (n, metin) => (n === 1 ? `1 could not be applied: ${metin}` : `${n} could not be applied: ${metin}`),
  anahtarGecersiz: "Linked Quran: the key was not accepted. Actions stay queued until you paste a new key.",
  muhkem: "Muhkam",
  mutesabih: "Mutashabih",
  kimler: "Who?",
  bildirBaslik: (m) => `Report: ${m}`,
  bildirSoru: "Why are you reporting this?",
  bildirGonder: "Send report",
  uyeBaslik: (m) => `Add a verse to «${m}»`,
  ayet: "Verse",
  rol: "Role",
  kelimeZorunlu: "Select words (required in this layer) — the claim is about the word itself",
  kelimeIstege: "Select words (optional) — if the claim anchors to specific words",
  notAlan: "Note (optional)",
  oneriUyari: "Shows in the strip right away under your name; a moderator reviews it later.",
  oner: "Propose",
  iliskiBaslik: (a) => `Suggest a relation from ${a}`,
  karsiAyet: "Other verse",
  islev: "How it relates",
  neden: "Why (optional)",
  iliskiGonder: "Propose the link",
  ayetIpucu: "surah:verse, e.g. 2:185",
};
const YAYINCI = ["yazar", "moderator", "admin"];
const YAYINDA = ["yayimda", "beklemede"]; // sitede herkese açık ya da incelemede: Yayın alanının durumları

/** Obsidian'ın onay penceresi (mobilde `confirm` yok). */
const onayla = (app, metin, evet) =>
  new Promise((tamam) => {
    const m = new Modal(app);
    m.contentEl.createEl("p", { text: metin });
    const d = m.contentEl.createDiv({ cls: "modal-button-container" });
    d.createEl("button", { text: evet, cls: "mod-cta" }).onclick = () => {
      tamam(true);
      m.close();
    };
    d.createEl("button", { text: KART.vazgec }).onclick = () => m.close();
    m.onClose = () => tamam(false);
    m.open();
  });

/**
 * Meal sekmeleri + yana kaydırma (kullanıcı kararı «ikisi birden»): ayet
 * kutusundaki meal kutuları tek kaydırmalı satıra, adları üstte sekme. Sekme
 * satırı kaydırır, kaydırma sekmeyi seçer (dinleyiciler belge düzeyinde,
 * `onload`: Live Preview kutuyu yeniden çizince öğedeki dinleyici kayboluyordu,
 * o144 CDP). Hangi meallerin görüneceğini yine `cssclasses` belirler (gizli
 * mealin sekmesi de CSS'le gizli). İki kipte koşar.
 */
const mealSekmeleri = (kutu) => {
  const icerik = kutu.querySelector(":scope > .callout-content");
  // `meal-N` 1.8.0 öncesi kasanın callout'u (o150).
  const mealler = icerik ? [...icerik.querySelectorAll(':scope > .callout:is([data-callout^="translation-"], [data-callout^="meal-"])')] : [];
  if (mealler.length < 2) return;
  const sekmeler = createDiv({ cls: "lq-tabs", attr: { role: "tablist" } });
  const satir = createDiv({ cls: "lq-translations" });
  mealler[0].before(sekmeler, satir);
  for (const m of mealler) {
    satir.append(m);
    sekmeler.createEl("button", {
      cls: "lq-tab",
      text: m.querySelector(".callout-title-inner")?.textContent.trim() ?? "",
      attr: { role: "tab", "data-translation": m.dataset.callout, "aria-selected": String(m === mealler[0]) },
    });
  }
  window.requestAnimationFrame(() => mealSec(satir));
};

/** Satırın görünen mealine göre sekmeyi seçer. */
const mealSec = (satir) => {
  const gorunen = [...satir.children].filter((m) => m.offsetParent !== null);
  if (!gorunen.length) return; // henüz çizilmedi: ilk sekme seçili kalır
  const aktif = gorunen[Math.min(Math.round(satir.scrollLeft / (satir.clientWidth || 1)), gorunen.length - 1)];
  for (const t of satir.previousElementSibling?.children ?? []) {
    t.setAttribute("aria-selected", String(t.dataset.translation === aktif?.dataset.callout));
  }
};

/**
 * İşaret satırının rozeti (iki kip): `deleted on site` (1.5.0) her alanda; 1.17.0'dan Taslak alanındaki taslak
 * işareti «Draft on site», «on site now» blokları. Rozetsiz işaret null.
 */
const rozet = (s, taslakta) => {
  const t = s.trim();
  if (t === SILINDI) return [KART.silindi, "deleted"];
  if (t === MEAL_SITEDE) return [KART.mealSitede, "on-site"];
  if (sitedeId(t)) return [KART.sitede, "on-site"];
  if (taslakta && notIsareti(t)?.[3] === "draft") return [KART.sitedeTaslak, "site-draft"];
  return null;
};

/** Rozet satırı; alanda önceki not varsa üstünde çizgi. `ic`: okuma kipinde not bloğunun içinde (kart satırı değil). */
const rozetSatiri = (ust, [metin, durum], ic = false) => {
  const d = createDiv({ cls: `${ic ? "" : "lq-card-line "}lq-badge-line${ust ? " lq-divider-above" : ""}` });
  d.createSpan({ cls: "lq-badge", text: metin, attr: { "data-status": durum } });
  return d;
};

/** Live Preview süsleri: kart başlığı, gizli işaret satırları, kart satırları, yer tutucu. */
const kartAlani = (eklenti) => {
  const { StateField, StateEffect, Decoration, EditorView, WidgetType } = cm;
  // Katman verisi gelince (1.6.0) belge değişmeden yeniden hesap: `yenidenCiz` bunu yollar.
  eklenti.katmanEtkisi = StateEffect.define();
  class Baslik extends WidgetType {
    constructor(x) {
      super();
      this.x = x;
    }
    eq(o) {
      return JSON.stringify(o.x) === JSON.stringify(this.x);
    }
    toDOM() {
      return eklenti.baslik(this.x);
    }
    ignoreEvent() {
      return true;
    }
  }
  // `[[…]] %%explains%%` sitedeki gibi küçük eğik etiket (o144); imleç satırdaysa ham metin.
  class Iliski extends WidgetType {
    constructor(kelime) {
      super();
      this.kelime = kelime;
    }
    eq(o) {
      return o.kelime === this.kelime;
    }
    toDOM() {
      return createSpan({ cls: "lq-relation-type", text: this.kelime });
    }
  }
  class Ayrim extends WidgetType {
    eq() {
      return true;
    }
    toDOM() {
      return createDiv({ cls: "lq-note-divider" });
    }
  }
  // İşaret rozeti (`rozet`): kart satırında; alanda önceki not varsa üstünde çizgi.
  class Rozet extends WidgetType {
    constructor(ust, r) {
      super();
      this.ust = ust;
      this.r = r;
    }
    eq(o) {
      return o.ust === this.ust && o.r[0] === this.r[0];
    }
    toDOM() {
      return rozetSatiri(this.ust, this.r);
    }
  }
  // Siteden okunan katmanlar (1.6.0): kartın son satırının altında blok.
  class Katmanlar extends WidgetType {
    constructor(x) {
      super();
      this.x = x;
    }
    eq(o) {
      return JSON.stringify(o.x) === JSON.stringify(this.x);
    }
    toDOM() {
      const el = eklenti.katmanCiz(this.x);
      el.addClass("lq-layers-block"); // kartın son satırından sonra kendi kart zemini
      return el;
    }
    ignoreEvent() {
      return true;
    }
  }
  const hesapla = (state) => {
    const file = state.field(editorInfoField, false)?.file;
    const yer = file && eklenti.yer(file);
    if (!state.field(editorLivePreviewField, false) || !yer) return Decoration.none;
    const kayit = eklenti.katmanAnlik(yer.sure);
    const acik = acikKatmanlar(eklenti.app.metadataCache.getFileCache(file)?.frontmatter);
    const doc = state.doc;
    const satirlar = doc.toString().split("\n");
    const imlec = doc.lineAt(state.selection.main.head).number - 1;
    const d = [];
    const satir = (i) => doc.line(i + 1);
    // İmleç gizli satıra girerse ham metin görünür (düzenlenebilsin).
    const gizle = (bas, son, widget) => {
      if (imlec >= bas && imlec <= son) return false;
      d.push(Decoration.replace({ block: true, ...(widget ? { widget } : {}) }).range(satir(bas).from, satir(son).to));
      return true;
    };
    for (const k of kartlar(satirlar)) {
      if (k.kutuSon < 0) continue;
      const durum = kartDurumu(satirlar, k);
      const taslakSon = k.ayrac >= 0 ? k.ayrac - 1 : k.son;
      const bas = { tur: "taslak", yol: file.path, a: k.a, dolu: durum.taslak, yayimlanir: taslakAyir(satirlar, k).yayimlanir };
      if (k.bolge > k.kutuSon) gizle(k.kutuSon, k.bolge - 1, new Baslik(bas));
      // `^s-a` yoksa başlık kutunun son satırının sonunda (dosya sonunda da geçerli konum).
      else d.push(Decoration.widget({ block: true, side: 1, widget: new Baslik(bas) }).range(satir(k.kutuSon - 1).to));
      let sonIcerik = k.son;
      while (sonIcerik >= k.bolge && satirlar[sonIcerik].trim() === "") sonIcerik--;
      let yerTutucu = !durum.taslak;
      const icerikGordu = { taslak: false, yayin: false };
      for (let i = k.bolge; i <= Math.max(sonIcerik, k.bolge) && i <= k.son; i++) {
        const s = satirlar[i];
        const alan = k.ayrac >= 0 && i > k.ayrac ? "yayin" : "taslak";
        if (i === k.ayrac) {
          if (durum.yayin) gizle(i, i, new Baslik({ tur: "yayin", yol: file.path, a: k.a, durum: durum.durum }));
          else gizle(i, i);
          continue;
        }
        const r = rozet(s, alan === "taslak");
        if (r) {
          gizle(i, i, new Rozet(icerikGordu[alan], r));
          continue;
        }
        if (isaretSatiri(s)) {
          // Alanın ilk notunun işareti gizli; aradakiler ince çizgi.
          gizle(i, i, icerikGordu[alan] && !MEAL_ISARETI.test(ISARET.exec(s)[1]) ? new Ayrim() : undefined);
          continue;
        }
        if (s.trim() !== "" && i >= k.taslak) icerikGordu[alan] = true;
        const sinif = ["lq-card-line"];
        if (i === Math.max(sonIcerik, k.bolge)) sinif.push("lq-card-end");
        if (yerTutucu && s.trim() === "" && imlec !== i && i <= taslakSon) {
          sinif.push("lq-placeholder");
          yerTutucu = false;
          d.push(Decoration.line({ class: sinif.join(" "), attributes: { "data-placeholder": KART.yerTutucu } }).range(satir(i).from));
          continue;
        }
        d.push(Decoration.line({ class: sinif.join(" ") }).range(satir(i).from));
        if (imlec === i) continue;
        for (const m of s.matchAll(ILISKI_ISARETI)) {
          const bas = satir(i).from + m.index + m[0].indexOf("]]") + 2;
          d.push(Decoration.replace({ widget: new Iliski(m[1].toLowerCase()) }).range(bas, satir(i).from + m.index + m[0].length));
        }
      }
      const liste = seritler(kayit?.veri, k.a, acik);
      const son = Math.min(Math.max(sonIcerik, k.bolge), k.son);
      if (liste.length && son >= 0) {
        const x = { liste, yol: file.path, s: yer.sure, a: k.a, cevrimdisi: !!kayit.cevrimdisi, zaman: kayit.zaman, ds: eklenti.eylemSurumu };
        d.push(Decoration.widget({ block: true, side: 1, widget: new Katmanlar(x) }).range(satir(son).to));
      }
    }
    return Decoration.set(d, true);
  };
  return StateField.define({
    create: hesapla,
    update: (deger, tr) =>
      tr.docChanged || tr.selection || tr.reconfigured || tr.effects.some((e) => e.is(eklenti.katmanEtkisi)) ? hesapla(tr.state) : deger,
    provide: (f) => EditorView.decorations.from(f),
  });
};

const SON = "linkedquran-son"; // 1.18.0: bu cihazda son okunan {s, a} (app.saveLocalStorage; sitedeki «kaldığım yer»le bağlı değil)
const GEZGIN = "linkedquran-gezgin"; // görünüm türü; app.saveLocalStorage anahtarı da: kenara bir kez konur, kişi kapatırsa geri gelmez
/**
 * Sol kenarda sure gezgini (1.9.0, kullanıcı kararı o152 «A · Sayfa (ayetler)»): kasadaki sure
 * sayfaları, açılınca altında mushaf sayfaları `p. 27 (177–181)`; sayfaya dokununca ilk ayetine.
 * Dosya gezgininin içine değil ayrı sekme (onun DOM'u Obsidian'ın iç işi). Obsidian'ın ağaç
 * sınıflarıyla çizilir: kasadaki eski `linkedquran.css` yeni kural istemez.
 */
class SureGezgini extends ItemView {
  constructor(leaf, p) {
    super(leaf);
    this.p = p;
    this.acik = new Set();
    this.dosyalar = new Set();
  }
  getViewType() {
    return GEZGIN;
  }
  getDisplayText() {
    return this.p.m.ad; // özel ad (METIN), sentence-case dışı
  }
  getIcon() {
    return "book-open";
  }
  async onClose() {
    window.clearTimeout(this.zaman); // 1.14.0: kapanınca bekleyen çizim kalmaz
  }
  /**
   * Kasanın sure sayfasıysa sure numarası. 1.17.3 (o194): senkronla aynı kural (`yer`, `KASA_YOLU` dahil); kasa dışında
   * aynı frontmatter'ı taşıyan dosyalar (kullanıcının kişisel not dosyaları, kullanıcı kararı «Gezginden kalksın») ikiz
   * satır olmaz.
   */
  sure(f) {
    return f?.extension === "md" ? this.p.yer(f)?.sure ?? null : null;
  }
  async onOpen() {
    const yakinda = () => {
      window.clearTimeout(this.zaman);
      this.zaman = window.setTimeout(() => this.ciz(), 300);
    };
    for (const o of ["create", "delete", "rename"]) this.registerEvent(this.app.vault.on(o, yakinda));
    this.registerEvent(this.app.metadataCache.on("changed", (f) => !!this.sure(f) !== this.dosyalar.has(f.path) && yakinda()));
    // Açılan sure kendiliğinden açık: Bakara'dayken sayfaları hazır.
    this.registerEvent(this.app.workspace.on("file-open", (f) => {
      const s = this.sure(f);
      if (!s || this.acik.has(s)) return;
      this.acik.add(s);
      this.ciz();
    }));
    const s = this.sure(this.app.workspace.getActiveFile());
    if (s) this.acik.add(s);
    // 1.18.0 (gezgin-ana, kullanıcı kararı «B: gezgin ana sayfa»): tepede «ayete git» kutusu ve «Kaldığın yer»; altında
    // sure listesi. Üst kısım bir kez kurulur, `ciz()` yalnız listeyi yeniler: kutudaki yazı ve odak kalır.
    const kok = this.contentEl;
    kok.empty();
    kok.addClass("nav-files-container");
    const ust = kok.createDiv({ cls: "lq-nav-top" });
    this.kutu = ust.createDiv({ cls: "search-input-container" })
      .createEl("input", { type: "search", placeholder: this.p.m.ayeteGitIpucu, attr: { enterkeyhint: "go", spellcheck: "false" } });
    this.sonuc = ust.createDiv({ cls: "lq-nav-result" });
    this.devam = ust.createDiv({ cls: "lq-nav-continue" });
    this.liste = kok.createDiv();
    this.kutu.addEventListener("input", () => this.sonucCiz());
    this.kutu.addEventListener("keydown", (e) => e.key === "Enter" && this.git(ayeteGit(this.kutu.value)));
    this.ciz();
  }
  /** Ayete git sonucu: tek satır («2:255 · Al-Baqarah») ya da neden gidilemediği. */
  sonucCiz() {
    const r = ayeteGit(this.kutu.value);
    this.sonuc.empty();
    if (!r) return;
    if (r.hata) return void this.sonuc.createDiv({ cls: "tree-item-self", text: this.p.m.ayetYok });
    const f = this.sureDosyasi.get(r.s);
    const ad = `${r.s}${r.a ? `:${r.a}` : ""} · ${SURE_ADLARI[r.s - 1][1]}`;
    if (!f) return void this.sonuc.createDiv({ cls: "tree-item-self", text: `${ad} — ${this.p.m.sureKasadaYok}` });
    const x = this.sonuc.createDiv({ cls: "tree-item-self is-clickable", attr: { "data-go": `${r.s}:${r.a ?? ""}` } });
    x.createDiv({ cls: "tree-item-inner", text: `→ ${ad}` });
    x.addEventListener("click", () => this.git(r));
  }
  git(r) {
    const f = r && !r.hata && this.sureDosyasi.get(r.s);
    if (!f) return;
    this.kutu.value = "";
    this.sonucCiz();
    this.p.sonYaz(r.s, r.a ?? 1);
    this.ac(f, r.a);
  }
  /** Bu cihazda son okunan ayet (`SON`); sure kasadaysa. */
  devamCiz() {
    const son = this.app.loadLocalStorage(SON);
    const f = son && this.sureDosyasi.get(son.s);
    this.devam.empty();
    if (!f) return;
    const x = this.devam.createDiv({ cls: "tree-item-self is-clickable", attr: { "data-continue": `${son.s}:${son.a}` } });
    setIcon(x.createDiv({ cls: "tree-item-icon" }), "bookmark");
    x.createDiv({ cls: "tree-item-inner", text: `${this.p.m.devam} · ${son.s}:${son.a} · ${SURE_ADLARI[son.s - 1][1]}` });
    x.addEventListener("click", () => this.ac(f, son.a));
  }
  ciz() {
    const kok = this.liste;
    const kaydirma = this.contentEl.scrollTop;
    kok.empty();
    const sureler = this.app.vault.getMarkdownFiles()
      .map((f) => [this.sure(f), f]).filter(([s]) => s)
      .sort((a, b) => a[0] - b[0] || a[1].path.localeCompare(b[1].path));
    this.dosyalar = new Set(sureler.map(([, f]) => f.path));
    this.sureDosyasi = new Map([...sureler].reverse()); // aynı sure iki dosyadaysa listede ilki
    if (!sureler.length) kok.createDiv({ cls: "pane-empty", text: this.p.m.gezginBos });
    for (const [s, f] of sureler) {
      const acik = this.acik.has(s);
      const oge = kok.createDiv({ cls: `tree-item${acik ? "" : " is-collapsed"}` });
      const bas = oge.createDiv({ cls: "tree-item-self is-clickable mod-collapsible", attr: { "data-surah": s } });
      setIcon(bas.createDiv({ cls: `tree-item-icon collapse-icon${acik ? "" : " is-collapsed"}` }), "right-triangle");
      bas.createDiv({ cls: "tree-item-inner", text: f.basename });
      // 1.17.3 (o194, kullanıcı kararı «Yalnız sayfalar açılsın»): sure adı yalnız sayfaları açıp kapatır, dosya açmaz
      // (telefonda dosya açılınca çekmece kapanıyordu); sureye sayfa satırından gidilir.
      bas.addEventListener("click", () => {
        if (acik) this.acik.delete(s);
        else this.acik.add(s);
        this.ciz();
      });
      if (!acik) continue;
      const cocuk = oge.createDiv({ cls: "tree-item-children" });
      for (const { sayfa, bas: b, son } of sayfaAraliklari(s)) {
        const sec = this.secili === `${s}:${sayfa}` ? " is-active" : "";
        const x = cocuk.createDiv({ cls: "tree-item" }).createDiv({ cls: `tree-item-self is-clickable${sec}`, attr: { "data-page": sayfa } });
        x.createDiv({ cls: "tree-item-inner", text: `p. ${sayfa} (${b === son ? b : `${b}–${son}`})` });
        x.addEventListener("click", () => {
          this.secili = `${s}:${sayfa}`; // son dokunulan sayfa vurgulu: uzun listede yer kaybolmasın
          this.contentEl.querySelectorAll(".tree-item-self.is-active").forEach((y) => y.removeClass("is-active"));
          x.addClass("is-active");
          this.p.sonYaz(s, b);
          this.ac(f, b);
        });
      }
    }
    this.contentEl.scrollTop = kaydirma;
    this.sonucCiz();
    this.devamCiz();
  }
  /** Dosyayı açar; `bas` verilirse o ayetten başlayan ilk `## N` başlığına (yoksa dosyanın başına). */
  async ac(f, bas) {
    const h = bas && (this.app.metadataCache.getFileCache(f)?.headings ?? [])
      .find((x) => x.level === 2 && /^\d+$/.test(x.heading) && +x.heading >= bas);
    await this.app.workspace.openLinkText(h ? `${f.path.slice(0, -3)}#${h.heading}` : f.path, "", false);
    // Büyük surede Live Preview satır yüksekliklerini çizdikçe düzeltir: tek kaydırma başlığı
    // ekran dışına düşürüyordu (o152 CDP, Bakara 1.8 MB: #177 → 175, #253 → boş). Birkaç kez başa
    // hizalanır. ponytail: sabit gecikmeler; o arada kişi kaydırırsa geri çekilir (~3 sn).
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!h || v?.file !== f || v.getMode() !== "source") return;
    for (const ms of [100, 400, 800, 1500]) {
      await new Promise((r) => window.setTimeout(r, ms));
      if (this.p.kapali || this.app.workspace.getActiveViewOfType(MarkdownView) !== v) return;
      const e = v.editor.cm;
      e.dispatch({ effects: cm.EditorView.scrollIntoView(e.state.doc.line(h.position.start.line + 1).from, { y: "start", yMargin: 8 }) });
    }
  }
}

module.exports = class LinkedQuran extends EklentiTabani {
  async onload() {
    this.m = METIN[String(moment.locale()).startsWith("tr") ? "tr" : "en"];
    this.ayar = Object.assign({}, VARSAYILAN, await this.loadData());
    this.kirli = new Set();
    this.hepsi = true; // açılışta bir kez bütün sure dosyaları (tam gönderim)
    // Cihaz tabanı (tasarım §2): {son, s: {"<sure>": {n: {id: [v, durum, ayet]},
    // b: {id: ayet} (bekleyen), k: `## N` sayısı}}}. Meal tabanı 1.5.0'da yok:
    // meal kasada kalır (eski kayıttaki `m` okunmaz).
    // localStorage'da: iCloud ile eşlenen data.json'a yalnız ayarlar yazılır.
    this.cihaz = this.app.loadLocalStorage(CIHAZ) ?? { s: {} };
    this.cihaz.t ??= {}; // 1.12.0: sure → son başarılı site metni yenilemesi (ms)
    this.tazeleniyor = new Set();
    this.izler = new Map(); // yol → bu oturumda okunan/yazılan metnin md5'i (yazma kapısı 3)
    this.isaretler = new Map(); // yol → son okumadaki not id'leri
    this.yazilacak = new Map(); // yol → çekme yanıtının o dosyası, kapılar tutunca yazılır
    this.kendi = new Map(); // yol → eklentinin yazdığı metin: bu `modify` kirli yapmaz
    this.tus = new Map(); // yol → son `editor-change`
    this.sira = Promise.resolve();
    this.sonIstek = 0;
    this.sonDurum = null;
    this.giden = new Map(); // yol → son başarılı turda sunucunun bildiği Yayın alanının md5'i (1.6.0 atlama)
    this.katmanlar = new Map(); // sure → {zaman, veri, cevrimdisi?} (1.6.0)
    this.katmanIstek = new Set();
    this.katmanDeneme = new Map(); // sure → son uç denemesi
    this.dolgular = []; // [{el, doldur}]: rozet ve çipler
    // Eylemler (1.7.0): kişinin sure hâli (sunucunun son söylediği), katman alınırkenki hâli
    // (sayı düzeltmesi), açık paneller (yalnız bellekte), cihazdaki kuyruk.
    this.durumlar = new Map();
    this.katmanDurum = new Map();
    this.durumDeneme = new Map();
    this.durumSira = new Set();
    this.acikPanel = new Set();
    this.kelimeler = new Map(); // sure → kelime dosyası (öneri penceresi)
    this.kuyruk = this.app.loadLocalStorage(KUYRUK)?.[this.ayar.adres] ?? [];
    this.kuyrukGitmedi = this.kuyruk.length > 0;
    this.eylemSurumu = 0;
    this.durum = this.addStatusBarItem();
    this.addSettingTab(new Ayarlar(this.app, this));
    // «Sync now»: notlar (anahtar varsa) + katmanlar tazelikten bağımsız (1.6.0).
    this.addCommand({
      id: "gonder",
      name: this.m.gonder,
      callback: () => {
        const y = this.app.workspace.getActiveFile?.() && this.yer(this.app.workspace.getActiveFile());
        for (const n of new Set([...this.katmanlar.keys(), ...(y ? [y.sure] : [])])) this.katman(n, true);
        if (y || this.kuyruk.length) this.eylemTur(y?.sure ?? this.kuyruk[0].sure); // kuyruk + kişinin hâli (1.7.0)
        this.gonder(true, true);
      },
    });
    // Kart (1.4.0): sahte `obsidian` modülünde (test) CodeMirror yok.
    if (cm.StateField) this.registerEditorExtension(kartAlani(this));
    this.registerMarkdownPostProcessor((el, ctx) => this.okumaKarti(el, ctx));
    this.registerEditorSuggest(new AyetOnerisi(this.app, this));
    // Sure gezgini (1.9.0): sol kenarda, bu cihazda bir kez kendiliğinden; sonra komutla.
    this.registerView(GEZGIN, (leaf) => new SureGezgini(leaf, this));
    this.addCommand({ id: "gezgin", name: this.m.gezgin, callback: () => this.gezginAc(true) });
    // 1.18.0: gezgini açıp «ayete git» kutusuna odaklanır.
    this.addCommand({ id: "ayete-git", name: this.m.ayeteGit, callback: async () => {
      const l = await this.gezginAc(true);
      await l.loadIfDeferred?.();
      l.view.kutu?.focus();
    } });
    // 1.15.0: telefonda sol çekmece tek sekme gösterir, gezgin «Files ⇅»'nin arkasında kalıyordu (o182).
    this.addRibbonIcon("book-open", this.m.gezgin, () => this.gezginAc(true));
    // Site metni (1.11.0, o166): ilk çalışma eski kasanın geçişidir, özet onayıyla (plan-reviewer o166 #5).
    this.addCommand({ id: "site-metni", name: this.m.tazele, callback: () => this.siteMetni() });
    // Eksik sureler (1.16.0; 1.12.0 «Add surah…» seçicisinin yerine, aynı kimlik): ayar ekranı kapanınca da.
    this.addCommand({ id: "sure-ekle", name: this.m.sureEkle, callback: () => this.eksikleriYaz() });
    // Kasayı hesaba bağlama (1.16.0): /hesap'taki `obsidian://linkedquran?key=…` bağlantısı.
    this.registerObsidianProtocolHandler("linkedquran", (q) => this.baglan(q.key));
    this.app.workspace.onLayoutReady(() => {
      if (this.app.loadLocalStorage(GEZGIN)) return;
      this.app.saveLocalStorage(GEZGIN, true);
      this.gezginAc(false);
    });
    document.body.classList.add("lq-plugin");
    // Meal sekmeleri: yakalama evresinde, Live Preview'ın kutuya tıkta kaynağı açmasından önce.
    const sekme = (e) => e.target.closest?.(".lq-tab");
    // Telefonda dipnot işareti (1.17.2, o194): Obsidian'da dokunuşla önizleme yok, işaret sayfa sonu listesine atlıyordu.
    const dipnot = (e) => (document.body.classList.contains("is-mobile") ? e.target.closest?.(".linkedquran a.footnote-link") : null);
    const durdur = (e) => {
      if (!sekme(e) && !dipnot(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    this.registerDomEvent(document, "pointerdown", durdur, true);
    this.registerDomEvent(document, "mousedown", durdur, true);
    this.registerDomEvent(document, "click", (e) => {
      const d = dipnot(e);
      if (d) {
        durdur(e);
        void this.dipnotPenceresi(d);
        return;
      }
      const t = sekme(e);
      if (!t) return;
      durdur(e);
      const satir = t.parentElement.nextElementSibling;
      const m = satir?.querySelector(`:scope > [data-callout="${t.dataset.translation}"]`);
      if (!m) return;
      satir.scrollTo({ left: m.offsetLeft }); // anında: yumuşak kaydırmayı CM ölçümü yarıda kesiyordu
      mealSec(satir);
    }, true);
    this.registerDomEvent(document, "scroll", (e) => {
      if (e.target.classList?.contains("lq-translations")) mealSec(e.target);
      // 1.18.0: okurken son ayet (gezginin «Kaldığın yer»i); kaydırma durduktan 1,5 sn sonra.
      window.clearTimeout(this.sonZaman);
      this.sonZaman = window.setTimeout(() => this.konumYaz(), 1500);
    }, { capture: true, passive: true });

    // Açılışta her dosya için `create` gelir; olaylar layout hazır olunca kaydedilir.
    this.app.workspace.onLayoutReady(() => {
      this.snippet = this.snippetGuncelle();
      const isaretle = async (f) => {
        if (!(f instanceof TFile) || f.extension !== "md") return;
        const k = this.kendi.get(f.path);
        if (k !== undefined && (await this.app.vault.cachedRead(f)) === k) return;
        this.kirli.add(f.path);
        this.zamanla();
      };
      this.registerEvent(this.app.vault.on("modify", isaretle));
      this.registerEvent(this.app.vault.on("create", isaretle));
      this.registerEvent(this.app.vault.on("rename", isaretle));
      // Diske kaydetmeden önce tuşta gelir: açık dosyaya yazmayı erteler.
      this.registerEvent(this.app.workspace.on("editor-change", (_, bilgi) => {
        if (bilgi?.file) this.tus.set(bilgi.file.path, Date.now());
      }));
      this.registerInterval(window.setInterval(() => this.cek(), CEKME));
      // Katmanlar (1.6.0): sure açılınca getir; `cssclasses` değişince rozet/çip ve şeritler yeniden.
      this.registerEvent(this.app.workspace.on("file-open", (f) => {
        const y = f && this.yer(f);
        if (!y) return;
        this.katman(y.sure);
        this.kendiliginden(f, y); // 1.12.0
      }));
      this.registerEvent(this.app.metadataCache.on("changed", (f) => {
        if (this.yer(f)) this.yenidenCiz();
      }));
      this.registerDomEvent(window, "focus", () => {
        this.cek();
        if (this.kuyruk.length) this.eylemTur(this.kuyruk[0].sure); // bağlantı geldiyse kuyruk gider (1.7.0)
      });
      this.zamanla(); // metadataCache bu sürede kesin hazır
    });
  }

  onunload() {
    this.kapali = true; // gezginin hizalama döngüsü uykudan dönünce durur (o172)
    document.body.classList.remove("lq-plugin");
    window.clearTimeout(this.zaman);
    window.clearTimeout(this.yazZaman);
    window.clearTimeout(this.cizZaman);
    window.clearTimeout(this.sonZaman);
  }

  zamanla() {
    window.clearTimeout(this.zaman);
    this.zaman = window.setTimeout(() => this.gonder(this.hepsi, false), BEKLEME);
  }

  /** İstekler ve yazmalar tek sırada: üst üste binmez. */
  sirala(is) {
    this.sira = this.sira.then(is).catch((e) => this.durum.setText(`${this.m.ad} ⚠ ${String(e?.message ?? e)}`));
    return this.sira;
  }

  /** `hepsi`: açılış/komut — bütün sure dosyaları, silmez; değilse kirliler, siler. */
  gonder(hepsi, elle) {
    return this.sirala(() => this.istek(hepsi ? "tam" : "kirli", elle));
  }

  /** Yalnız çekme: ilk tam gönderimden sonra, son istekten 60 sn geçtiyse. */
  cek() {
    if (this.hepsi || !this.ayar.anahtar || Date.now() - this.sonIstek < BEKLEME) return;
    return this.sirala(() => this.istek("cek", false));
  }

  sure(no) {
    const s = (this.cihaz.s[no] ??= { n: {}, b: {}, k: 0 });
    s.mz ??= {}; // 1.17.0: ayet → kasadaki kendi mealin işaret zamanı (kasada silineni tanımak için)
    s.sil ??= { n: {}, m: {} }; // 1.17.0: kasada silinen site taslağı (id → [v, ayet]) ve meal (ayet → zaman); `tabanKur` silmez
    return s;
  }

  kaydet() {
    this.app.saveLocalStorage(CIHAZ, this.cihaz);
  }

  async gezginAc(goster) {
    let l = this.app.workspace.getLeavesOfType(GEZGIN)[0];
    if (!l) {
      l = this.app.workspace.getLeftLeaf(false);
      await l.setViewState({ type: GEZGIN, active: false });
    }
    if (goster) await this.app.workspace.revealLeaf(l);
    return l;
  }

  /** «Kaldığın yer» (1.18.0): bu cihazda, `SON`; açık gezgin yeniden çizilir. */
  sonYaz(s, a) {
    this.app.saveLocalStorage(SON, { s, a });
    for (const l of this.app.workspace.getLeavesOfType(GEZGIN)) l.view.devamCiz?.();
  }

  /** Etkin sure sayfasında görünümün tepesindeki satırdan önceki son `## N` başlığı. */
  konumYaz() {
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    const s = v?.file && this.yer(v.file)?.sure;
    if (!s) return;
    const satir = v.currentMode.getScroll();
    const h = (this.app.metadataCache.getFileCache(v.file)?.headings ?? [])
      .filter((x) => x.level === 2 && /^\d+$/.test(x.heading) && x.position.start.line <= satir).at(-1);
    const son = this.app.loadLocalStorage(SON);
    if (h && (son?.s !== s || son?.a !== +h.heading)) this.sonYaz(s, +h.heading);
  }

  /** Sure dosyasıysa {sure, kalip}; frontmatter önbellekten, yoksa metinden. */
  yer(f, icerik) {
    if (!KASA_YOLU.test(f.path)) return null;
    const onbellek = this.app.metadataCache.getFileCache(f);
    const fm = onbellek ? (onbellek.frontmatter ?? {}) : icerik !== undefined && SURE.test(icerik) ? fmOku(icerik) : null;
    if (!fm || !["linkedquran/surah", "linkedquran/sure"].includes(fm.type ?? fm.tur)) return null;
    const sure = Number(fm.surah ?? fm.sure);
    if (!Number.isInteger(sure) || sure < 1 || sure > 114) return null;
    const k = (fm.template ?? fm.kalip) === "varsayilan" ? "default" : (fm.template ?? fm.kalip);
    return { sure, kalip: KALIPLAR.includes(k) ? k : "default" };
  }

  async istek(tur, elle) {
    if (!this.ayar.anahtar) {
      if (elle) new Notice(this.m.anahtarYok);
      return;
    }
    const tam = tur === "tam";
    // Kirliler kümeden şimdi alınır: istek sürerken düzenlenen dosya kümeye yeniden
    // girer ve sonraki turda gider; hata olursa alınanlar geri konur.
    const yollar = tur === "cek" ? [] : [...this.kirli];
    if (tur !== "cek") this.kirli.clear();
    const geriKoy = () => yollar.forEach((y) => this.kirli.add(y));
    const okunacak = new Set(tam ? this.app.vault.getMarkdownFiles().map((f) => f.path) : yollar);

    const sureler = [];
    const dosyalar = [];
    const sil = [];
    const geriCek = [];
    const yarim = new Map(); // yol → `## N` sayısı
    const ozler = new Map(); // yol → bu turda giden Yayın alanının md5'i
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!KASA_YOLU.test(f.path)) continue;
      const icerik = okunacak.has(f.path) ? await this.app.vault.cachedRead(f) : undefined;
      const y = this.yer(f, icerik);
      if (!y) continue;
      sureler.push({ sure: y.sure, yol: f.path, kalip: y.kalip });
      if (icerik === undefined) continue;

      // Okumada taban yalnız ileri (tasarım §2): bilinmeyen id eklenir, büyük v
      // durumuyla alınır.
      const s = this.sure(y.sure);
      const o = oku(icerik);
      const ids = new Set();
      for (const [a, x] of o.ayetler) {
        if (x.meal !== null) s.mz[a] = x.zaman ?? "";
        for (const t of x.notlar) {
          ids.add(t.id);
          if (!s.n[t.id] || t.v > s.n[t.id][0]) s.n[t.id] = [t.v, t.durum, a];
          delete s.b[t.id];
        }
      }
      // Back to draft (1.5.0): Taslak alanında, cihazın sitede yayımda bildiği not.
      // Yalnız kimlik gider; metin kasada kalır.
      const geri = [...alanIdleri(icerik).taslak].filter((id) => YAYINDA.includes(s.n[id]?.[1]));
      geriCek.push(...geri);
      this.isaretler.set(f.path, ids);
      this.izler.set(f.path, md5(icerik));
      // Yarım dosya (`## N` yok ya da bilinenden az): bu tur silmez, yazmaz.
      // Kişi bölümü başlığıyla sildiyse sonraki tur (sayı = k) siler.
      if (o.k === 0 || o.k < s.k) yarim.set(f.path, o.k);
      if (o.k > 0) s.k = o.k;
      if (tur === "kirli" && !yarim.has(f.path)) {
        const baska = new Set([...this.isaretler].flatMap(([yol, x]) => (yol === f.path ? [] : [...x])));
        // Bekleyenlerin hepsi gider: metni dosyada duran ya da düzeltilip yeni
        // sürüm alan not sunucuda silinmez (kasa_esitle sil sorgusu). 1.5.0:
        // yerel taslağı silmek sunucuya gitmez (kullanıcı kararı o145 «Dokunulmasın»).
        const idler = [
          ...Object.keys(s.n).map(Number)
            .filter((id) => !(id in s.b) && !ids.has(id) && !baska.has(id) && YAYINDA.includes(s.n[id][1])),
          ...Object.keys(s.b).map(Number),
        ];
        if (idler.length) sil.push({ sure: y.sure, idler });
      }
      // 1.6.0 (kullanıcı kararı o148 «taslakta istek yok»): kirli dosyanın Yayın alanı son
      // başarılı turdakiyle aynıysa gönderilmez. Yarım dosya, silinecek ya da geri çekilecek
      // not varsa yine gider. `izler`/`isaretler`/taban yukarıda her durumda güncellendi
      // (yazma kapısı bayatlamasın; plan-reviewer o148 2. tur #1, #2).
      const giden = incelt(yayinSuz(icerik, s.n)); // yalnız Yayın alanı (1.5.0)
      const oz = md5(giden);
      if (tur === "kirli" && !yarim.has(f.path) && !geri.length && !sil.some((x) => x.sure === y.sure) && this.giden.get(f.path) === oz) continue;
      ozler.set(f.path, oz);
      dosyalar.push({
        yol: f.path,
        icerik: giden,
        taban: Object.fromEntries(Object.entries(s.n).map(([id, [v, durum]]) => [id, [v, durum]])),
        bekleyen: Object.keys(s.b).map(Number),
      });
    }
    if (tur === "cek" ? sureler.length === 0 : dosyalar.length === 0) {
      if (tam) {
        new Notice(this.m.sureYok);
        this.hepsi = false;
      }
      return;
    }

    let y;
    try {
      y = await requestUrl({
        url: `${this.ayar.adres.replace(/\/+$/, "")}/api/kasa-senkron`,
        method: "POST",
        headers: { authorization: `Bearer ${this.ayar.anahtar.trim()}` },
        contentType: "application/json",
        // Yalnız kirli gönderim silebilir: açılıştaki ve komuttaki tam gönderim silmez.
        body: JSON.stringify({
          surum: SURUM, tam, ...(this.cihaz.son ? { son: this.cihaz.son } : {}), sureler, dosyalar, ...(sil.length ? { sil } : {}),
          ...(geriCek.length ? { geri_cek: geriCek } : {}),
        }),
        throw: false,
      });
    } catch (e) {
      this.durum.setText(`${this.m.ad} ⚠ ${String(e?.message ?? e)}`);
      if (elle) new Notice(this.m.hata(String(e?.message ?? e)));
      geriKoy();
      return;
    }
    let g = {};
    try {
      g = JSON.parse(y.text);
    } catch { /* bozuk yanıt ya da çevrimdışı: varsayılan kalır */ }
    if (y.status === 401) {
      new Notice(this.m.gecersiz);
      this.durum.setText(`${this.m.ad} ⚠ 401`);
      geriKoy();
      return;
    }
    if (y.status !== 200) {
      new Notice(this.m.hata(`${y.status} ${g.kod ?? ""}`.trim()));
      this.durum.setText(`${this.m.ad} ⚠ ${y.status}`);
      geriKoy();
      return;
    }

    this.sonIstek = Date.now();
    if (tam) this.hepsi = false;
    for (const [yol, oz] of ozler) if (!yarim.has(yol)) this.giden.set(yol, oz);
    if (g.son) this.cihaz.son = g.son;
    if (g.rol) this.cihaz.rol = g.rol; // Publish düğmesi (1.4.0)
    // Yanıt tabanı ilerletir: kasanın açtığı sürüm «sitede değişti» sayılmaz.
    const ayetler = new Map();
    for (const x of g.yazilan ?? []) {
      const [s, a] = String(x.ayet).split(":").map(Number);
      this.sure(s).n[x.id] = [x.v, x.durum, a];
      ayetler.set(x.id, [s, a]);
    }
    for (const id of g.bekleyen ?? []) {
      const sa = ayetler.get(id);
      if (sa) this.sure(sa[0]).b[id] = sa[1];
    }
    for (const x of g.yaz ?? []) {
      if (!yarim.has(x.yol)) this.yazilacak.set(x.yol, x);
    }
    for (const [yol, k] of yarim) {
      // Eski bekleyen yazma da düşer: silinen bölümü geri getirmesin. Bölümü
      // olan dosya sonraki turda (sayı = k) yeniden gider; bölümsüz dosya silmez.
      this.yazilacak.delete(yol);
      if (k > 0) {
        this.kirli.add(yol);
        this.zamanla();
      }
    }
    for (const x of g.yeni ?? []) {
      if (this.app.vault.getAbstractFileByPath(x.yol)) continue;
      const klasor = x.yol.slice(0, x.yol.lastIndexOf("/"));
      if (klasor && !this.app.vault.getAbstractFileByPath(klasor)) await this.app.vault.createFolder(klasor);
      this.kendi.set(x.yol, x.icerik);
      this.izler.set(x.yol, md5(x.icerik));
      await this.app.vault.create(x.yol, x.icerik);
      this.tabanKur(x.yol, Number(fmOku(x.icerik).surah), x.icerik, []);
    }
    this.kaydet();

    const uyarilar = g.uyarilar ?? [];
    if (uyarilar.length > 0 && tur !== "cek") {
      const u = uyarilar.map((x) => `${x.kod}${x.yol ? ` — ${x.yol}` : ""}${x.ek ? ` (${x.ek})` : ""}`).join("\n");
      new Notice(this.m.uyari(u), 15_000);
    }
    this.sonDurum = {
      saat: moment().format("HH:mm"),
      n: Object.values(g.eklenen ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
      cakisma: Number(g.eklenen?.cakisma) || 0,
      kodlar: uyarilar.map((x) => x.kod),
    };
    await this.yaz();
    if (elle) new Notice(this.cubuk());
  }

  /**
   * Çekilen bölgeleri dosyalara yazar, üç kapıyla (tasarım §4): dosya kirli
   * değil; son tuştan 30 sn geçti; `process` içindeki metin bu oturumda
   * okunan/yazılanla aynı. Tutmayan ertelenir, 30 sn sonra yeniden denenir.
   */
  async yaz() {
    window.clearTimeout(this.yazZaman);
    for (const [yol, x] of [...this.yazilacak]) {
      const f = this.app.vault.getAbstractFileByPath(yol);
      if (!(f instanceof TFile)) {
        this.yazilacak.delete(yol);
        continue;
      }
      if (this.kirli.has(yol) || Date.now() - (this.tus.get(yol) ?? 0) < ACIK_DOSYA) continue;
      // Değişiklik yoksa hiç yazılmaz: yazım iCloud'da öteki cihaza `modify` olarak gider.
      const once = await this.app.vault.cachedRead(f);
      let sonra = null;
      const y = this.yer(f, once);
      if (md5(once) === this.izler.get(yol)) {
        const bekleyen = new Set(Object.values(this.cihaz.s).flatMap((s) => Object.keys(s.b).map(Number)));
        sonra = birlestir(once, x, bekleyen, y ? this.sure(y.sure) : undefined);
        if (sonra !== once) {
          this.kendi.set(yol, sonra);
          await this.app.vault.process(f, (data) => {
            if (data !== once) {
              sonra = null;
              return data;
            }
            return sonra;
          });
        }
      }
      if (sonra === null) continue;
      this.yazilacak.delete(yol);
      this.izler.set(yol, md5(sonra));
      if (y) this.tabanKur(yol, y.sure, sonra, x.tut ?? []);
      this.giden.set(yol, md5(incelt(yayinSuz(sonra, y ? this.sure(y.sure).n : {}))));
    }
    this.kaydet();
    this.cubuk();
    if (this.yazilacak.size) this.yazZaman = window.setTimeout(() => this.sirala(() => this.yaz()), ACIK_DOSYA);
  }

  /**
   * Bayat snippet (1.13.0, o170): kasada `linkedquran.css` snippet'i varsa her açılışta sitedekiyle karşılaştırılır
   * (kullanıcı kararı «Statik dosya, her açılışta»); farklıysa eskisi `.bak`, yenisi kişinin iki boyut değeriyle
   * yazılır. Dosya yoksa, ağ yoksa ya da yanıt snippet değilse dokunulmaz. 1.13.0 öncesi kopyanın eklentisiz
   * kuralları eski gövde sınıfını arar; geçiş olana kadar (ilk çevrimiçi açılış) kartın üstüne biner.
   * `kur` (1.16.0, eksik sureler yazılırken): dosya yoksa yazılır ve açılır (kapı 5, kullanıcı kararı o185
   * «Kurulumda»: sonradan silinen ya da kapatılan snippet her açılışta geri gelmez).
   */
  async snippetGuncelle(kur = false) {
    const a = this.app.vault.adapter;
    const klasor = `${this.app.vault.configDir}/snippets`;
    const yol = `${klasor}/linkedquran.css`;
    try {
      const var_ = await a.exists(yol);
      if (!var_ && !kur) return;
      const r = await requestUrl({ url: `${this.ayar.adres.replace(/\/+$/, "")}/obsidian/linkedquran/linkedquran.css`, throw: false });
      if (r.status !== 200 || !r.text.startsWith(SNIPPET_BASI)) return;
      if (!var_) {
        if (!(await a.exists(klasor))) await a.mkdir(klasor);
        await a.write(yol, r.text);
        this.app.customCss?.requestLoadSnippets?.();
        this.app.customCss?.setCssEnabledStatus?.("linkedquran", true);
        return;
      }
      const eski = await a.read(yol);
      const yeni = snippetYenile(eski, r.text);
      if (yeni === null) return;
      await a.write(`${yol}.bak`, eski);
      await a.write(yol, yeni);
      this.app.customCss?.requestLoadSnippets?.();
      new Notice(this.m.snippetYenilendi);
    } catch { /* çevrimdışı ya da yazılamadı: kasadaki dosya kalır (yalnız .bak yazılmış olabilir) */ }
  }

  /**
   * Meal kataloğu (sitenin `dizin.json`'u, yalnız etkin olanlar) ve kelime kaynakları; oturumda bir kez. `/kuran/*`
   * bir yıl `immutable` sunulur (`next.config.mjs`) ve damgasız adres Obsidian'ın ağ önbelleğinden eski kopyayı
   * veriyordu (o185 S14: `kelimeKaynaklari` yoktu); `?v=` her istekte önbelleği atlar.
   */
  async katalogAl() {
    if (this.katalog) return this.katalog;
    try {
      const r = await requestUrl({ url: `${this.ayar.adres.replace(/\/+$/, "")}/kuran/dizin.json?v=${Date.now()}`, throw: false });
      const d = r.status === 200 ? JSON.parse(r.text) : null;
      if (Array.isArray(d?.translations)) {
        this.katalog = d.translations.filter((x) => x.is_active);
        this.kelimeKaynaklari = Array.isArray(d.kelimeKaynaklari) ? d.kelimeKaynaklari : []; // 1.16.0 Word by word
      }
    } catch { /* bozuk yanıt ya da çevrimdışı: varsayılan kalır */ }
    return this.katalog ?? null;
  }

  /** Kasadaki sure dosyaları, numara sırasıyla; eklentinin az önce yarattığı dosya önbellek dolmadan da (1.16.0). */
  sureDosyalari() {
    return this.app.vault.getMarkdownFiles()
      .map((f) => ({ f, y: this.yer(f, this.kendi.get(f.path)) })).filter((x) => x.y)
      .sort((a, b) => a.y.sure - b.y.sure || a.f.path.localeCompare(b.f.path));
  }

  /** Metin ayarı: kayıtlı, yoksa sayfaların `text_source`'undan çıkarılan (kaydedilmez), o da olmazsa `{kod}`. */
  metinAyari(katalog) {
    if (this.ayar.metin) return this.ayar.metin;
    for (const { f } of this.sureDosyalari()) {
      const kaynak = this.app.metadataCache.getFileCache(f)?.frontmatter?.text_source;
      if (kaynak) return ayarCikar(kaynak, katalog, this.kelimeKaynaklari);
    }
    return { arapca: true, kelime: "", mealler: [] };
  }

  /** Kelime mealinin özetteki adı: kaynağın adı ya da `EN`/`TR` (quran.com). */
  kelimeAdi(k) {
    return this.kelimeKaynaklari?.find((t) => t.slug === k)?.name ?? k.toUpperCase();
  }

  /** «Site metnini yenile»: özet onayı, sonra sureler sırayla (`sirala`: senkronla üst üste binmez). */
  async siteMetni() {
    if (!this.ayar.anahtar) return new Notice(this.m.anahtarYok);
    const dosyalar = this.sureDosyalari();
    if (!dosyalar.length) return new Notice(this.m.sureYok);
    const katalog = await this.katalogAl();
    if (!katalog) return new Notice(`${this.m.ad}: ${this.m.katalogYok}`);
    const metin = this.metinAyari(katalog);
    if (metin.kod) return new Notice(this.m.ayarOkunamadi(metin.parca), 15_000);
    const ad = (slug) => katalog.find((t) => t.slug === slug)?.name ?? slug;
    if (!(await onayla(this.app, this.m.tazeleOzet(dosyalar.length, metin.mealler.map(ad), metin.kelime && this.kelimeAdi(metin.kelime), metin.arapca), this.m.tazeleEvet))) return;
    if (!this.ayar.metin) {
      this.ayar.metin = metin;
      await this.saveData(this.ayar);
    }
    return this.sirala(async () => {
      const mevcut = new Set(dosyalar.map((x) => x.y.sure));
      let [yazilan, ayni] = [0, 0];
      const atlanan = [];
      for (const { f, y } of dosyalar) {
        this.durum.setText(`${this.m.ad} ↻ ${y.sure}/${dosyalar.length}`);
        const r = await this.sureyiTazele(f, y, mevcut, metin);
        if (r === "yazildi") yazilan++;
        else if (r === "ayni") ayni++;
        else {
          atlanan.push(`${y.sure} (${r})`);
          if (["anahtar_gecersiz", "hiz_siniri", "cevrimdisi"].includes(r)) break;
        }
      }
      // Eski kasanın geçişi ancak hepsi yazılınca biter; kendiliğinden yenileme (1.12.0) buna bakar.
      if (!atlanan.length) this.sonYenilenen = JSON.stringify(metin); // ayar ekranı kapanınca yeniden sorulmasın (1.12.0)
      if (!atlanan.length && !this.ayar.gecti) {
        this.ayar.gecti = true;
        await this.saveData(this.ayar);
      }
      if (!this.cubuk()) this.durum.setText(""); // senkron henüz yoksa ilerleme yazısı kalmasın
      new Notice(this.m.tazeleBitti(yazilan, ayni, atlanan), atlanan.length ? 20_000 : 6_000);
    });
  }

  /**
   * Uçtan bir surenin kasa dosyası (`/api/lq/v1/kasa/{n}`; `kok`: kök dosyalar da, `kisisel`: kişinin listeleriyle,
   * yalnız `kok` ile). Dönüş: yanıt ya da kod.
   */
  async metinAl(sure, kalip, komsular, metin, kok = false, kisisel = false) {
    const q = new URLSearchParams();
    for (const m of metin.mealler) q.append("meal", m);
    if (metin.kelime) q.set("kelime", metin.kelime);
    if (metin.arapca) q.set("arapca", "1");
    q.set("kalip", kalip);
    for (const k of komsular) q.append("komsu", String(k));
    if (kok) q.set("kok", "1");
    if (kok && kisisel) q.set("kisisel", "1");
    let r;
    try {
      r = await requestUrl({
        url: `${this.ayar.adres.replace(/\/+$/, "")}/api/lq/v1/kasa/${sure}?${q}`,
        headers: { authorization: `Bearer ${this.ayar.anahtar.trim()}` },
        throw: false,
      });
    } catch {
      return "cevrimdisi";
    }
    if (r.status === 401) return "anahtar_gecersiz";
    if (r.status === 429) return "hiz_siniri";
    if (r.status === 503 && r.text.includes('"kaynak_yuklenemedi"')) return "kaynak_yuklenemedi"; // 2a: kelime kaynağı
    if (r.status !== 200) return `http_${r.status}`;
    let g;
    try {
      g = JSON.parse(r.text);
    } catch { /* bozuk yanıt ya da çevrimdışı: varsayılan kalır */ }
    if (g?.api !== 1 || g.sure !== sure || typeof g.icerik !== "string") return "bozuk_yanit";
    return g;
  }

  /** Bu cihazda surenin site metni yenilendi (1.12.0 `kendiliginden`'in haftalık sayacı; dosyaya yazılmaz). */
  damga(sure) {
    this.cihaz.t[sure] = Date.now();
    this.kaydet();
  }

  /**
   * Bir sure: uçtan metin, `tazele`, yazma. Kapılar `yaz()`'ınkiler: dosya kirli değil, son tuştan 30 sn geçti,
   * `process` içindeki metin okunanla aynı. Dönüş: `yazildi` · `ayni` · kod.
   */
  async sureyiTazele(f, y, mevcut, metin) {
    const g = await this.metinAl(y.sure, y.kalip, [y.sure - 1, y.sure + 1].filter((k) => mevcut.has(k)), metin);
    if (typeof g === "string") return g;
    const yol = f.path;
    if (this.kirli.has(yol) || Date.now() - (this.tus.get(yol) ?? 0) < ACIK_DOSYA) return "duzenleniyor";
    const once = await this.app.vault.cachedRead(f);
    const t = tazele(once, g.icerik);
    if (t.kod) return t.kod;
    if (!t.degisti) {
      this.damga(y.sure);
      return "ayni";
    }
    let sonra = t.metin;
    this.kendi.set(yol, sonra);
    await this.app.vault.process(f, (data) => {
      if (data !== once) {
        sonra = null;
        return data;
      }
      return sonra;
    });
    if (sonra === null) return "duzenleniyor";
    // Yayın alanı değişmedi: `giden`e dokunulmaz (gönderilmemiş bir değişiklik «gitti» sayılmasın, plan-reviewer
    // sapma o166 #4). `izler` yalnız eklenti `once`yi zaten biliyorduysa ilerler; bilmiyorsa çekme kapısı yine bekler.
    if (this.izler.get(yol) === md5(once)) this.izler.set(yol, md5(sonra));
    this.damga(y.sure);
    return "yazildi";
  }

  /** 1.12.0: geçmiş kasada açılan sure bu cihazda haftadır yenilenmediyse tek sure; sessiz, kod durum çubuğuna. */
  kendiliginden(f, y) {
    if (!this.ayar.gecti || !this.ayar.anahtar || !this.ayar.metin || this.tazeleniyor.has(y.sure)) return;
    if (Date.now() - (this.cihaz.t[y.sure] ?? 0) < YENILEME) return;
    this.tazeleniyor.add(y.sure);
    return this.sirala(async () => {
      try {
        const mevcut = new Set(this.sureDosyalari().map((x) => x.y.sure));
        const r = await this.sureyiTazele(f, y, mevcut, this.ayar.metin);
        if (!["yazildi", "ayni", "duzenleniyor"].includes(r)) this.durum.setText(`${this.m.ad} ⚠ ${y.sure}: ${r}`);
      } finally {
        this.tazeleniyor.delete(y.sure);
      }
    });
  }

  /**
   * Ayar ekranı kapanınca: metin seçimi değiştiyse var olan sureler, bir kez sorarak (geçmiş kasada, 1.12.0); sonra
   * kasada 114'ten az sure varsa eksiklerin hepsi (1.16.0, kullanıcı kararı o182 «Evet, hepsi»). Seçim yoksa sessiz.
   */
  async ayarKapandi(ilk) {
    if (this.ayar.gecti && JSON.stringify(this.ayar.metin ?? null) !== (this.sonYenilenen ?? ilk)) await this.siteMetni();
    const kasada = new Set(this.sureDosyalari().map((x) => x.y.sure));
    if (this.ayar.anahtar && kasada.size < 114 && (this.ayar.metin || kasada.size)) await this.eksikleriYaz(true);
  }

  /** Bağlantı (1.16.0): `obsidian://linkedquran?key=lq_…`. Biçimsiz anahtar yok sayılır; başka anahtarın yerine onayla. */
  async baglan(key) {
    const k = String(key ?? "").trim();
    if (!ANAHTAR.test(k)) return;
    if (this.ayar.anahtar && this.ayar.anahtar !== k && !(await onayla(this.app, this.m.baskaHesap, this.m.bagla))) return;
    if (this.ayar.anahtar !== k) {
      this.ayar.anahtar = k;
      this.hepsi = true; // yeni anahtarla bütün notlar bir kez gitsin (ayar ekranındaki gibi)
      await this.saveData(this.ayar);
      this.zamanla();
      this.yenidenCiz();
    }
    new Notice(this.m.baglandi, 10_000);
    this.app.setting?.open();
    this.app.setting?.openTabById(this.manifest.id);
  }

  /**
   * Eksik sureler (1.16.0, eklentiyle kurulum; 1.12.0 «Sure ekle…»nin yerine): kasada olmayan bütün sureler numara
   * sırasıyla uçtan yaratılır, klasörü kasadaki surelerinki. İlk başarılı istek `kok=1&kisisel=1`: kök dosyalar (dizin
   * kişinin favori/ayraç/son konumuyla, Contents.base, Collections/*) yalnız `Linked Quran/Surahs` altında ve yoksa
   * (kapı 3). Komşu bağlantısı bitince kasada olacak surelere; yarıda kalırsa bağlantı sonradan yazılan dosyaya çözülür.
   * Kasadaki komşular yeni sureye bağlanmak için yenilenir. Anahtar, ağ, 429 ve 503 (kelime kaynağı) hatasında durur,
   * kalanı söyler. Snippet yoksa yazılır ve açılır (kapı 5). `sessiz`: ayar ekranı kapanınca, seçimsiz uyarı yok.
   */
  async eksikleriYaz(sessiz = false) {
    const uyar = (x, ms) => void (sessiz || new Notice(x, ms));
    if (!this.ayar.anahtar) return uyar(this.m.anahtarYok);
    let metin = this.ayar.metin;
    if (!metin) {
      if (!this.sureDosyalari().length) return uyar(this.m.sureEkleMealYok, 10_000); // sessiz mealsiz varsayılan yok
      const katalog = await this.katalogAl();
      if (!katalog) return uyar(`${this.m.ad}: ${this.m.katalogYok}`);
      metin = this.metinAyari(katalog);
      if (metin.kod) return uyar(this.m.ayarOkunamadi(metin.parca), 15_000);
      this.ayar.metin = metin;
      await this.saveData(this.ayar);
    }
    if (!metin.mealler.length && !metin.kelime && !metin.arapca) return uyar(this.m.sureEkleMealYok, 10_000); // kapı 4
    return this.sirala(async () => {
      const mevcut = new Map(this.sureDosyalari().map((x) => [x.y.sure, x]));
      const eksik = AYET_SAYILARI.map((_, i) => i + 1).filter((n) => !mevcut.has(n));
      if (!eksik.length) return uyar(this.m.eksikYok);
      await this.snippetGuncelle(true); // tam kasada silinen snippet geri gelmesin (kapı 5 «Kurulumda», o185 sapma #3)
      const ust = (p) => p.slice(0, Math.max(0, p.lastIndexOf("/")));
      const ilk = mevcut.values().next().value;
      let klasor = ilk && ust(ilk.f.path);
      const yaz = async (yol, icerik) => {
        if (this.app.vault.getAbstractFileByPath(yol)) return false;
        if (ust(yol) && !this.app.vault.getAbstractFileByPath(ust(yol))) await this.app.vault.createFolder(ust(yol));
        this.kendi.set(yol, icerik);
        await this.app.vault.create(yol, icerik);
        return true;
      };
      const sonra = new Set([...mevcut.keys(), ...eksik]);
      const eklenen = new Set();
      const atlanan = [];
      let [kok, dur] = [false, null];
      for (const n of eksik) {
        this.durum.setText(`${this.m.ad} ↓ ${mevcut.size + eklenen.size} / 114`);
        const g = await this.metinAl(n, ilk?.y.kalip ?? "default", [n - 1, n + 1].filter((k) => sonra.has(k)), metin, !kok, true);
        if (typeof g === "string") {
          if (["anahtar_gecersiz", "hiz_siniri", "cevrimdisi", "kaynak_yuklenemedi"].includes(g)) {
            dur = g;
            break;
          }
          atlanan.push(`${n} (${g})`);
          continue;
        }
        klasor ??= ust(g.yol);
        const yol = `${klasor}/${g.yol.split("/").pop()}`;
        if (!(await yaz(yol, g.icerik))) {
          atlanan.push(`${n} (dosya_var)`);
          continue;
        }
        this.izler.set(yol, md5(g.icerik));
        this.damga(n);
        eklenen.add(n);
        if (kok || !g.kok) continue;
        kok = true;
        if (/(?:^|\/)Linked Quran\/Surahs$/.test(klasor)) for (const d of g.kok) await yaz(`${ust(klasor)}/${d.yol.slice(d.yol.indexOf("/") + 1)}`, d.icerik);
      }
      for (const [k, x] of mevcut) {
        if (!eklenen.has(k - 1) && !eklenen.has(k + 1)) continue;
        const r = await this.sureyiTazele(x.f, x.y, sonra, metin);
        if (r === "yazildi" || r === "ayni") continue;
        // Yazılamayan komşu (açık dosyada eklentinin kendi yazması da 30 sn kapısını işletir): ←/→ bağlantısı bir
        // sonraki açılışta gelsin, haftalık sayaç beklemesin (plan-reviewer sapma o168 #1, #4).
        delete this.cihaz.t[k];
        this.kaydet();
        if (r !== "duzenleniyor") this.durum.setText(`${this.m.ad} ⚠ ${k}: ${r}`);
      }
      if (!mevcut.size && eklenen.size) {
        this.sonYenilenen = JSON.stringify(metin); // hepsi bu seçimle yazıldı: ayar kapanınca yenileme sorulmasın
        if (!this.ayar.gecti) {
          this.ayar.gecti = true; // geçirilecek eski kasa yok: kendiliğinden yenileme ilk günden açık (kapı 2)
          await this.saveData(this.ayar);
        }
      }
      if (!this.cubuk()) this.durum.setText(""); // senkron henüz yoksa ilerleme yazısı kalmasın
      const kalan = eksik.length - eklenen.size;
      new Notice(this.m.eksikBitti(eklenen.size, kalan, dur ? this.m.neden(dur) : atlanan.join(" · ")), kalan ? 20_000 : 8_000);
    });
  }

  /** Çekme otoritedir: `tut` dışındaki her ayetin tabanı yazılan bölgeden kurulur. */
  tabanKur(yol, no, icerik, tut) {
    if (!Number.isInteger(no) || no < 1 || no > 114) return;
    const s = this.sure(no);
    const tutulan = new Set(tut.map(Number));
    for (const id in s.n) if (!tutulan.has(s.n[id][2])) delete s.n[id];
    for (const id in s.b) if (!tutulan.has(s.b[id])) delete s.b[id];
    for (const a in s.mz) if (!tutulan.has(Number(a))) delete s.mz[a];
    delete s.m; // 1.4.0 meal tabanı
    const o = oku(icerik);
    const ids = new Set();
    for (const [a, x] of o.ayetler) {
      x.notlar.forEach((t) => ids.add(t.id));
      if (tutulan.has(a)) continue;
      for (const t of x.notlar) s.n[t.id] = [t.v, t.durum, a];
      if (x.meal !== null) s.mz[a] = x.zaman ?? "";
    }
    s.k = o.k;
    this.isaretler.set(yol, ids);
  }

  /** Kart başlığı: Taslak alanı «Your personal note · Draft · Publish», Yayın alanı durum rozeti. */
  baslik(x) {
    const d = createDiv({ cls: "lq-card-head", attr: { "data-kind": x.tur } });
    if (x.tur === "yayin") {
      d.createSpan({ text: KART.yayin });
      d.createSpan({ cls: "lq-badge", text: KART.durum[x.durum] ?? KART.durum.draft, attr: { "data-status": x.durum ?? "draft" } });
      if (this.ayar.anahtar) this.dugme(d, KART.geriAl, () => this.geriAl(x.yol, x.a));
      return d;
    }
    d.createSpan({ text: KART.not });
    if (!x.dolu) return d;
    d.createSpan({ cls: "lq-badge", text: KART.taslak });
    const rol = this.ayar.anahtar ? this.cihaz.rol : null;
    if (x.yayimlanir !== false && (rol === "aday" || YAYINCI.includes(rol))) this.dugme(d, rol === "aday" ? KART.gonder : KART.yayimla, () => this.yayimla(x.yol, x.a));
    return d;
  }

  /** Kart başlığının sağındaki bağlantı düğmesi (Publish, Back to draft). */
  dugme(d, metin, is) {
    d.createSpan({ cls: "lq-spacer" });
    const b = d.createEl("button", { cls: "lq-publish", text: metin });
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      is();
    });
  }

  /** Back to draft (sitedeki gibi onaysız): Yayın notları Taslak'a, senkron hemen gider (`geri_cek`). */
  async geriAl(yol, a) {
    const f = this.app.vault.getAbstractFileByPath(yol);
    if (!(f instanceof TFile)) return;
    await this.app.vault.process(f, (x) => taslagaTasi(x, a));
    this.kirli.add(yol);
    this.gonder(false, false);
  }

  /** Publish: yazara onay sorulur (site gibi), not Yayın alanına taşınır, senkron hemen gider. */
  async yayimla(yol, a) {
    const f = this.app.vault.getAbstractFileByPath(yol);
    if (!(f instanceof TFile)) return;
    if (YAYINCI.includes(this.cihaz.rol) && !(await onayla(this.app, KART.onay, KART.yayimla))) return;
    await this.app.vault.process(f, (x) => yayimaTasi(x, a));
    this.kirli.add(yol);
    this.gonder(false, false);
  }

  /**
   * Okuma kipi kartı: ayet kutusunun altına başlık (ve boş notta yer tutucu),
   * not blokları kart sınıfıyla, işaret paragrafları gizli ya da çizgi. Live
   * Preview'da `getSectionInfo` yok: orada yalnız meal sekmeleri (kartı CM çizer).
   */
  okumaKarti(el, ctx) {
    const kaynak = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    const sureMi = kaynak instanceof TFile && !!this.yer(kaynak);
    for (const k of el.querySelectorAll('.callout[data-callout="verse"]')) {
      mealSekmeleri(k);
      if (sureMi) this.rozetKoy(k, kaynak);
    }
    if (sureMi) for (const k of el.querySelectorAll('.callout[data-callout="layers"]')) this.ciplerKoy(k, kaynak);
    // Obsidian'ın sayfa sonu dipnot listesi: bölüm bilgisi belgenin son satırlarını verir, işaret satırı sanılıp
    // gizleniyordu (telefonda dokunuş boş sayfa sonuna atlıyordu; 1.17.2, o194).
    if (el.querySelector(":scope > section.footnotes")) return;
    const bilgi = ctx.getSectionInfo(el);
    const f = bilgi && this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(f instanceof TFile) || !this.yer(f)) return;
    if (this.okumaOnbellek?.metin !== bilgi.text) {
      const satirlar = bilgi.text.split("\n");
      this.okumaOnbellek = { metin: bilgi.text, satirlar, kartlar: kartlar(satirlar) };
    }
    const { satirlar, kartlar: kk } = this.okumaOnbellek;
    const k = kk.find((x) => bilgi.lineStart >= x.baslik && bilgi.lineStart <= x.son);
    if (!k || k.kutuSon < 0 || bilgi.lineStart === k.baslik) return;
    const durum = kartDurumu(satirlar, k);
    const kutu = el.querySelector('.callout[data-callout="verse"]');
    if (kutu) {
      const b = this.baslik({ tur: "taslak", yol: f.path, a: k.a, dolu: durum.taslak, yayimlanir: taslakAyir(satirlar, k).yayimlanir });
      kutu.after(b);
      if (!durum.taslak) {
        const yer = createDiv({ cls: `lq-placeholder-reading${durum.yayin ? "" : " lq-card-end"}`, text: KART.yerTutucu });
        b.after(yer);
        if (!durum.yayin) this.seritKoy(yer, f, k.a);
      }
      return;
    }
    if (bilgi.lineStart < k.bolge) return;
    const satirlarim = satirlar.slice(bilgi.lineStart, bilgi.lineEnd + 1);
    // Alanın içinde bu bloktan önce not var mı: varsa işaret iki notu ayıran çizgi olur.
    const alanBas = k.ayrac >= 0 && bilgi.lineStart > k.ayrac ? k.ayrac + 1 : k.taslak;
    const oncesi = dolu(satirlar, alanBas, bilgi.lineStart - 1);
    if (satirlarim.every((s) => s.trim() === "" || isaretSatiri(s))) {
      const r = satirlarim.map((s) => rozet(s, k.ayrac < 0 || bilgi.lineStart < k.ayrac)).find(Boolean);
      if (r) {
        el.empty();
        el.append(rozetSatiri(oncesi, r));
        return;
      }
      if (bilgi.lineStart <= k.ayrac && k.ayrac <= bilgi.lineEnd) {
        if (!durum.yayin) return el.addClass("lq-marker-hidden");
        el.empty();
        el.append(this.baslik({ tur: "yayin", yol: f.path, a: k.a, durum: durum.durum }));
      } else el.addClass(oncesi ? "lq-marker-divider" : "lq-marker-hidden");
      return;
    }
    el.addClass("lq-card-block");
    if (oncesi && notIsareti(satirlarim[0])) el.addClass("lq-divider-above");
    // İşaret satırı metinle tek paragraf bölümü olur (okuma kipi): rozet bloğun başına (1.17.1; `deleted on site` de).
    const r = rozet(satirlarim.find((s) => s.trim() !== "") ?? "", k.ayrac < 0 || bilgi.lineStart < k.ayrac);
    if (r) el.prepend(rozetSatiri(false, r, true));
    if (!dolu(satirlar, bilgi.lineEnd + 1, k.son)) {
      el.addClass("lq-card-end");
      this.seritKoy(el, f, k.a, true);
    }
  }

  /** Okuma kipi: kartın son öğesinin altına (`ic`: içine) açık katmanların şeritleri. */
  seritKoy(el, f, a, ic = false) {
    const y = this.yer(f);
    const kayit = y && this.katmanAnlik(y.sure);
    const liste = seritler(kayit?.veri, a, acikKatmanlar(this.app.metadataCache.getFileCache(f)?.frontmatter));
    if (!liste.length) return;
    const d = this.katmanCiz({ liste, yol: f.path, s: y.sure, a, cevrimdisi: !!kayit.cevrimdisi, zaman: kayit.zaman });
    if (ic) el.append(d);
    else {
      d.addClass("lq-layers-block");
      el.after(d);
    }
  }

  /** Sure kasadaysa ve `## a` başlığı yoksa ayet yok sayılır; sure kasada değilse bilinemez (false). */
  ayetYok(s, a) {
    const f = this.app.vault.getMarkdownFiles().find((x) => this.yer(x)?.sure === s);
    const h = f && this.app.metadataCache.getFileCache(f)?.headings;
    return !!h && !h.some((x) => x.level === 2 && x.heading === String(a));
  }

  /** Kasadaki `## a` başlığının bağlantı metni (`dosya#a`); sure ya da başlık kasada yoksa null. */
  ayetLinki(s, a, kaynak) {
    const f = this.app.vault.getMarkdownFiles().find((x) => this.yer(x)?.sure === s);
    const baslik = f && this.app.metadataCache.getFileCache(f)?.headings?.some((h) => h.level === 2 && h.heading === String(a));
    return baslik ? `${this.app.metadataCache.fileToLinktext(f, kaynak, true)}#${a}` : null;
  }

  /** `/` menüsünün bağlantısı: hedef sure kasadaysa onun `## a` başlığına, yoksa sitenin biçimi `[[s:a]]` (`kasaOku` ikisini de okur). */
  ayetBaglantisi(s, a, b, kaynak) {
    const ref = `${s}:${a}${b ? `-${b}` : ""}`;
    const link = this.ayetLinki(s, a, kaynak);
    return link ? `[[${link}|${ref}]]` : `[[${ref}]]`;
  }

  // ---------------------------------------------------------- katmanlar (1.6.0)

  /** Bellekteki kayıt; yoksa ya da bayatsa arkada getirir (gelince `yenidenCiz`). Çizim bunu çağırır. */
  katmanAnlik(n) {
    const k = this.katmanlar.get(n);
    if (!katmanTaze(k, Date.now())) this.katman(n);
    return k;
  }

  /**
   * Bir surenin katman verisi: bellek → cihaz deposu → uç. Taze değilse ya da
   * `zorla` («Sync now») ise uçtan ister; başarısızsa (çevrimdışı) son kayıt
   * «Offline» işaretiyle kalır, dakikada en çok bir deneme.
   */
  async katman(n, zorla = false) {
    if (this.katmanIstek.has(n)) return;
    this.katmanIstek.add(n);
    try {
      const anahtar = `${this.ayar.adres}|${n}`;
      let eski = this.katmanlar.get(n);
      if (!eski) {
        eski = await katmanDeposu.al(anahtar);
        if (eski) {
          this.katmanlar.set(n, eski);
          this.yenidenCiz();
        }
      }
      if (!zorla && (katmanTaze(eski, Date.now()) || Date.now() - (this.katmanDeneme.get(n) ?? 0) < KATMAN_DENEME)) return;
      this.katmanDeneme.set(n, Date.now());
      let y;
      try {
        y = await requestUrl({ url: `${this.ayar.adres.replace(/\/+$/, "")}/api/lq/v1/en/${n}`, throw: false });
      } catch {
        if (eski && !eski.cevrimdisi) {
          this.katmanlar.set(n, { ...eski, cevrimdisi: true });
          this.yenidenCiz();
        }
        return;
      }
      let veri;
      try {
        veri = JSON.parse(y.text);
      } catch { /* bozuk yanıt ya da çevrimdışı: varsayılan kalır */ }
      if (y.status !== 200) return;
      if (veri?.api !== LQ_API) {
        if (!this.surumUyarisi) new Notice(KART.surumEski, 15_000);
        this.surumUyarisi = true;
        return;
      }
      if (!katmanKabul(veri, eski)) return;
      const kayit = { zaman: Date.now(), veri };
      this.katmanlar.set(n, kayit);
      // Sayılar artık bu hâli yansıtıyor (1.7.0 iyimser sayı bunun üstüne kurulur).
      if (this.durumlar.has(n)) this.katmanDurum.set(n, this.durumlar.get(n));
      else this.katmanDurum.delete(n);
      await katmanDeposu.koy(anahtar, kayit);
      this.yenidenCiz();
    } finally {
      this.katmanIstek.delete(n);
    }
  }

  /** Açık sure görünümlerini yeniden çizer (Live Preview etkisi, okuma kipi `rerender`), bekleyen rozet/çipleri doldurur. */
  yenidenCiz() {
    window.clearTimeout(this.cizZaman);
    this.cizZaman = window.setTimeout(() => {
      // Post-processor öğesi belgeye çizimden sonra takılır: yalnız takılıp kopan (ya da
      // 1 dk takılmayan) öğe düşer (o148 CDP: çip kabı takılmadan atılıyordu).
      this.dolgular = this.dolgular.filter((x) => {
        x.gordu ||= x.el.isConnected;
        return x.gordu ? x.el.isConnected : Date.now() - x.zaman < 60_000;
      });
      for (const x of this.dolgular) {
        try {
          x.doldur();
        } catch (e) {
          console.error("Linked Quran", e);
        }
      }
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const v = leaf.view;
        if (!v?.file || !this.yer(v.file)) continue;
        if (this.katmanEtkisi) v.editor?.cm?.dispatch({ effects: this.katmanEtkisi.of(null) });
        if (v.getMode?.() === "preview") v.previewMode?.rerender(true);
      }
    }, 50);
  }

  /**
   * Şeritler (iki kip): katman adı, satırlar (etiket + öğeler), çevrimdışıysa tarih.
   * 1.7.0 (kullanıcı kararı o149 «A · Dokununca panel»): eylem kimliği olan öğe
   * düğmedir; dokunuş altında sitedeki panel gibi destek sayısı, I agree /
   * Withdraw, Report, bağlantı ve (düğümde) öneri açar.
   */
  katmanCiz({ liste, yol, s, a, cevrimdisi, zaman }) {
    const kap = createDiv({ cls: "lq-layers" });
    const anahtar = !!this.ayar.anahtar;
    const durum = this.durumAnlik(s);
    for (const k of liste) {
      const d = kap.createDiv({ cls: "lq-layer", attr: { "data-layer": k.id, "data-kind": k.tur } });
      const ad = d.createDiv({ cls: "lq-layer-name", text: k.ad });
      // Sitede ilişki önerisi ayet sayfasında (ayet sabit); kasada kartın Relations başlığı (o149 «Panelden + şerit başlığından»).
      if (anahtar && k.tur === "iliski" && k.roller.length) {
        this.eylemDugmesi(ad, KART.iliskiOner, "lq-action-link", () => this.iliskiPenceresi(s, a, k.roller));
      }
      for (const r of k.satirlar) {
        const satir = d.createDiv({ cls: "lq-layer-item" });
        const paneller = [];
        if (r.etiket) satir.createSpan({ cls: "lq-layer-label", text: r.etiket });
        r.ogeler.forEach((o, i) => {
          if (i) satir.appendText(" · ");
          if (!k.bilinmeyen && panelli(o, k.tur)) paneller.push(this.panelliOge(satir, o, k, { yol, s, a, durum }));
          else this.ogeCiz(satir, o, yol, k.bilinmeyen ? null : k.tur);
          if (o.durum === "beklemede") satir.createSpan({ cls: "lq-badge", text: KART.durum.pending, attr: { "data-status": "pending" } });
        });
        if (r.ogeler.length === 1 && r.ogeler[0].aciklama) satir.createDiv({ cls: "lq-layer-desc", text: r.ogeler[0].aciklama });
        for (const p of paneller) d.append(p);
      }
      if (k.bilinmeyen) this.disBaglanti(d.createDiv({ cls: "lq-layer-open" }), KART.sitedeAc, `/ayet/${s}/${a}`);
    }
    if (cevrimdisi) kap.createDiv({ cls: "lq-layer-offline", text: KART.cevrimdisi(moment(zaman).format("D MMM, HH:mm")) });
    if (anahtar && this.kuyrukGitmedi && this.kuyruk.length) kap.createDiv({ cls: "lq-layer-offline", text: KART.kuyrukSayisi(this.kuyruk.length) });
    return kap;
  }

  /** Düğme (iki kip): Live Preview'da imleci taşımasın, kartın tıkına geçmesin. */
  eylemDugmesi(ust, metin, cls, tik, attr = {}) {
    const b = ust.createEl("button", { cls, text: metin, attr });
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tik(b);
    });
    return b;
  }

  /** Öğe düğmesi + paneli (panel satırın altına konur); açık paneller sayfa başına bellekte. */
  panelliOge(satir, o, k, { yol, s, a, durum }) {
    const anahtar = `${yol}|${a}|${o.ref}`;
    const panel = createDiv({ cls: "lq-panel" });
    panel.hidden = !this.acikPanel.has(anahtar);
    this.eylemDugmesi(satir, o.metin, "lq-item-button", (b) => {
      panel.hidden = !panel.hidden;
      b.setAttr("aria-expanded", String(!panel.hidden));
      if (panel.hidden) this.acikPanel.delete(anahtar);
      else this.acikPanel.add(anahtar);
    }, { "aria-expanded": String(!panel.hidden), ...(o.aciklama ? { title: o.aciklama } : {}) });

    const alt = panel.createDiv({ cls: "lq-panel-row" });
    const etkin = destekEtkin(this.kuyruk, durum, o.ref);
    const katmanda = destekEtkin([], this.katmanDurum.get(s) ?? durum, o.ref);
    alt.createSpan({ cls: "lq-panel-count", text: KART.destekci(destekSayisi(o, etkin, katmanda)) });
    if (this.ayar.anahtar) {
      this.eylemDugmesi(alt, etkin ? KART.destekGeri : KART.katil, "lq-action-button", () => this.eylem(s, { tur: "destek", hedef: o.ref, istek: !etkin }), { "aria-pressed": String(etkin) });
      if (this.kuyrukGitmedi && this.kuyruk.some((x) => x.tur === "destek" && x.hedef === o.ref)) {
        alt.createSpan({ cls: "lq-badge", text: KART.kuyrukta, attr: { "data-status": "pending" } });
      }
      this.eylemDugmesi(alt, KART.bildir, "lq-action-link lq-muted", () => this.bildirPenceresi(s, o));
    }
    const [hs, ha] = String(o.hedef ?? "").split(":").map(Number);
    const link = o.hedef ? this.ayetLinki(hs, ha, yol) : null;
    if (link) {
      const el = alt.createEl("a", { cls: "internal-link", text: KART.ac(o.hedef), attr: { "data-href": link, href: link } });
      el.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(link, yol);
      });
    } else if (o.url) this.disBaglanti(alt, k.tur === "iliski" ? KART.ac(o.metin) : KART.sitedeAc, o.url);
    if (this.ayar.anahtar && k.tur === "dugum" && o.dugum) {
      const ad = KART.tekil[k.id] ?? k.ad.toLowerCase();
      this.eylemDugmesi(panel.createDiv({ cls: "lq-panel-row" }), KART.uyeOner(ad), "lq-action-link", () => this.uyelikPenceresi(s, a, o, k));
    }
    if (!this.ayar.anahtar) panel.createDiv({ cls: "lq-panel-hint", text: KART.anahtarIpucu });
    return panel;
  }

  /** Öğe: kasa içi ayet (`hedef`), yorum (`yazi`: metin + «Open on site»), site bağlantısı (`url`) ya da düz metin; `tur` null = bilinmeyen. */
  ogeCiz(satir, o, yol, tur) {
    if (!tur) return satir.createSpan({ text: o.metin });
    const [s, a] = String(o.hedef ?? "").split(":").map(Number);
    const link = o.hedef ? this.ayetLinki(s, a, yol) : null;
    if (link) {
      const el = satir.createEl("a", { cls: "internal-link", text: o.metin, attr: { "data-href": link, href: link } });
      if (o.aciklama) el.setAttr("title", o.aciklama);
      el.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(link, yol);
      });
      return;
    }
    if (tur === "yazi") {
      // Yorum: metin düz (uç 300 karakterde keser), bağlantı ayrı (kart taslağı o148).
      satir.createSpan({ cls: "lq-layer-text", text: o.metin });
      return o.url && this.disBaglanti(satir, KART.sitedeAc, o.url);
    }
    if (o.url) return this.disBaglanti(satir, o.metin, o.url, o.aciklama);
    satir.createSpan({ text: o.metin });
  }

  /** Site bağlantısı: tarayıcıda açılır. */
  disBaglanti(ust, metin, url, baslik) {
    const href = `${this.ayar.adres.replace(/\/+$/, "")}${url}`;
    const el = ust.createEl("a", { cls: "external-link", text: metin, attr: { href, target: "_blank", rel: "noopener" } });
    if (baslik) el.setAttr("title", baslik);
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(href);
    });
  }

  /**
   * Çizildikten sonra veriyle dolan öğeler (iki kip): ayet başlığındaki rozet ve
   * Layers kutusundaki çipler. Obsidian kutuyu yeniden çizmeyebilir; veri ya da
   * `cssclasses` değişince `yenidenCiz` bunları yerinde yeniler.
   */
  dolgu(el, doldur) {
    this.dolgular.push({ el, doldur, zaman: Date.now() });
    doldur();
  }

  /** Ayet kutusunun başlığı: `[s:a](…/ayet/s/a)` bağlantısından ayet; açık `rozet` katmanları (muhkem). */
  rozetKoy(kutu, f) {
    const m = /\/ayet\/(\d+)\/(\d+)/.exec(kutu.querySelector(".callout-title a")?.getAttr?.("href") ?? "");
    const baslik = kutu.querySelector(".callout-title-inner");
    const y = this.yer(f);
    if (!m || !baslik || !y) return;
    const a = Number(m[2]);
    const kap = baslik.createSpan({ cls: "lq-verse-badges" });
    // Başlığa tık kutuyu katlamasın / Live Preview'da kaynağı açmasın (1.7.0 düğmeleri ve «Who?»).
    kap.addEventListener("mousedown", (e) => e.stopPropagation());
    kap.addEventListener("click", (e) => e.stopPropagation());
    this.dolgu(kap, () => {
      kap.empty();
      const acik = acikKatmanlar(this.app.metadataCache.getFileCache(f)?.frontmatter);
      const veri = this.katmanAnlik(y.sure)?.veri;
      // Muhkem oyu yalnız yazar ve üstünde (sitedeki kural); oy yoksa da düğmeler (sayı 0).
      const muhkem = veri?.katmanlar?.some((k) => k.id === "muhkam" && k.tur === "rozet") && acik.has("muhkam");
      if (muhkem && this.ayar.anahtar && YAYINCI.includes(this.cihaz.rol)) {
        const durum = this.durumAnlik(y.sure);
        const etkin = sinifEtkin(this.kuyruk, durum, y.sure, a);
        const katmanda = sinifEtkin([], this.katmanDurum.get(y.sure) ?? durum, y.sure, a);
        const n = sinifSayilari(veri.ayetler?.[a]?.muhkam?.[0]?.kimler, etkin, katmanda);
        for (const tur of ["muhkem", "mutesabih"]) {
          this.eylemDugmesi(kap, `${KART[tur]} ${n[tur]}`, "lq-action-button lq-classify", () =>
            this.eylem(y.sure, { tur: "sinif", ayet: `${y.sure}:${a}`, istek: etkin === tur ? null : tur }), { "aria-pressed": String(etkin === tur) });
        }
        if (this.kuyrukGitmedi && this.kuyruk.some((x) => x.tur === "sinif" && x.ayet === `${y.sure}:${a}`)) {
          kap.createSpan({ cls: "lq-badge", text: KART.kuyrukta, attr: { "data-status": "pending" } });
        }
        return;
      }
      for (const o of rozetler(veri, a, acik)) {
        kap.createSpan({ cls: "lq-badge", text: o.metin, attr: { "data-status": "published", ...(o.etiket ? { title: o.etiket } : {}) } });
        if (!o.kimler?.length) continue;
        // «Who?» (sitedeki gibi, kullanıcı kararı o149 «Adlar da olsun»).
        const kim = kap.createEl("details", { cls: "lq-who" });
        kim.createEl("summary", { text: KART.kimler });
        for (const tur of ["muhkem", "mutesabih"]) {
          const adlar = o.kimler.filter((x) => x.tur === tur);
          if (!adlar.length) continue;
          const p = kim.createDiv();
          p.createEl("b", { text: `${KART[tur]}: ` });
          adlar.forEach((x, i) => {
            if (i) p.appendText(", ");
            this.disBaglanti(p, x.ad, x.url);
          });
        }
      }
    });
  }

  /**
   * Layers kutusu bütün katmanların düğmesi (1.10.0, kullanıcı kararı o158 «A · Properties gizli»):
   * Text (kutunun yazılı listesindeki katmanlar), linkedquran.com (site katmanları), Size. Dokunuş o
   * sayfanın `cssclasses`ını değiştirir (eklentisiz kasa da onu okur); yazılı liste okunduysa gizlenir.
   * Site katmanını kapatırken 1.8.0 öncesi `lq-k-<id>` da silinir. Site verisi yokken (çevrimdışı) Text ve Size yine çizilir.
   */
  ciplerKoy(kutu, f) {
    const y = this.yer(f);
    const icerik = kutu.querySelector(".callout-content");
    if (!y || !icerik) return;
    const rehber = rehberGruplari([...icerik.querySelectorAll("li")].map((li) => li.textContent));
    // Satır içi stil değil sınıf (1.14.0, topluluk dizini incelemesi): kural styles.css'te.
    if (rehber.metin.length) for (const c of [...icerik.children]) c.classList.add("lq-guide-hidden");
    const kap = icerik.createDiv({ cls: "lq-chips" });
    this.dolgu(kap, () => {
      kap.empty();
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const liste = sinifListesi(fm);
      const grup = (ad, ogeler) => {
        if (!ogeler.length) return;
        const g = kap.createDiv({ cls: "lq-chip-group" });
        g.createDiv({ cls: "lq-chip-label", text: ad });
        const sira = g.createDiv({ cls: "lq-tabs" });
        for (const o of ogeler) {
          // `lq-tab` değil: meal sekmelerinin belge düzeyi dinleyicisi o sınıfın tıkını yakalayıp durdurur (o148 CDP).
          const b = sira.createEl("button", { cls: "lq-chip", text: o.ad, attr: { "aria-pressed": String(o.acik), "data-class": o.siniflar[0] } });
          b.addEventListener("mousedown", (e) => e.preventDefault());
          b.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.app.fileManager.processFrontMatter(f, (x) => {
              x.cssclasses = sinifCevir(sinifListesi(x), o.siniflar, o.dislar);
            });
          });
        }
      };
      grup(KART.katmanMetin, rehber.metin.map(([s, ad]) => ({ ad, siniflar: [s], acik: liste.includes(s) })));
      const veri = this.katmanAnlik(y.sure)?.veri;
      if (veri) {
        const acik = acikKatmanlar(fm);
        grup(KART.katmanSite, veri.katmanlar.map((k) => ({ ad: k.ad, siniflar: [`lq-${k.id}`, `lq-k-${k.id}`], acik: acik.has(k.id) })));
      }
      const boyutlar = rehber.boyut.map(([s]) => s);
      const tur = (s) => BOYUT_SINIFI.exec(s)[1];
      grup(KART.katmanBoyut, rehber.boyut.map(([s, ad]) => ({ ad, siniflar: [s], dislar: boyutlar.filter((x) => x !== s && tur(x) === tur(s)), acik: liste.includes(s) })));
    });
  }

  // ---------------------------------------------------------- eylemler (1.7.0)

  /** Kişinin sure hâli; yoksa (anahtar varsa) arkada ister, dakikada en çok bir deneme. */
  durumAnlik(n) {
    const d = this.durumlar.get(n);
    if (!d && this.ayar.anahtar && Date.now() - (this.durumDeneme.get(n) ?? 0) > KATMAN_DENEME) {
      this.durumDeneme.set(n, Date.now());
      this.eylemTur(n);
    }
    return d;
  }

  durumYaz(n, yeni) {
    // Katman henüz bu hâlle alınmadıysa sayılar eski hâle göre düzeltilsin.
    if (!this.katmanDurum.has(n) && this.durumlar.has(n)) this.katmanDurum.set(n, this.durumlar.get(n));
    this.durumlar.set(n, yeni);
  }

  kuyrukKaydet() {
    const t = this.app.loadLocalStorage(KUYRUK) ?? {};
    t[this.ayar.adres] = this.kuyruk;
    this.app.saveLocalStorage(KUYRUK, t);
  }

  /** Eylem: önce kuyruğa (çevrimiçi de: düğme hemen istenen hâli gösterir), sonra gönderim. */
  eylem(n, e) {
    this.kuyruk = kuyrugaEkle(this.kuyruk, { sure: n, ...e });
    this.kuyrukKaydet();
    this.eylemSurumu++;
    this.yenidenCiz();
    this.eylemTur(n);
  }

  /**
   * Kuyruğun (en çok 50) gönderimi + sure `n`'deki hâl, tek istek. Ağ hatası, 5xx, 401
   * ve 429'da kuyruk kalır; işlenen her eylem düşer, uygulanamayanlar tek bildirimde.
   */
  async eylemTur(n) {
    if (!this.ayar.anahtar) return;
    if (this.eylemSuruyor) return void this.durumSira.add(n);
    this.eylemSuruyor = true;
    const gonderilen = gidecekler(this.kuyruk);
    const kuyruktandi = this.kuyrukGitmedi;
    try {
      let y;
      try {
        y = await requestUrl({
          url: `${this.ayar.adres.replace(/\/+$/, "")}/api/lq/v1/eylem`,
          method: "POST",
          contentType: "application/json",
          headers: { authorization: `Bearer ${this.ayar.anahtar}` },
          body: JSON.stringify({ sure: n, eylemler: gonderilen.map(({ sure, ...e }) => e) }),
          throw: false,
        });
      } catch {
        y = null;
      }
      let g = null;
      try {
        g = JSON.parse(y?.text ?? "");
      } catch { /* bozuk yanıt ya da çevrimdışı: varsayılan kalır */ }
      // 413 (gövde büyük): kuyruk kalır; parçalama (`gidecekler`) bunu beklenmedik kılar.
      if (!y || y.status >= 500 || y.status === 413 || !g) {
        if (gonderilen.length && !this.kuyrukGitmedi) new Notice(KART.cevrimdisiKuyruk);
        if (gonderilen.length) this.kuyrukGitmedi = true;
        return;
      }
      if (y.status === 401) {
        if (gonderilen.length && !this.anahtarUyarisi) new Notice(KART.anahtarGecersiz, 15_000);
        this.anahtarUyarisi = true;
        return;
      }
      if (g.durum) this.durumYaz(n, g.durum);
      if (y.status === 429) return void new Notice(`${this.m.ad}: ${g.metin ?? ""}`);
      // 400 yalnız bütün gövde bozuksa (uç biçimsiz eylemi tek tek `govde_bozuk` yazar);
      // aynı kuyruğu sonsuza dek göndermesin.
      const islenen = y.status === 200 ? (g.sonuclar ?? []).length : gonderilen.length;
      const sonuclar = y.status === 200 ? g.sonuclar ?? [] : gonderilen.map(() => ({ ok: false, metin: g.kod ?? String(y.status) }));
      this.kuyruk = kuyruktanDus(this.kuyruk, gonderilen, islenen);
      this.kuyrukKaydet();
      this.anahtarUyarisi = false;
      if (!this.kuyruk.length) this.kuyrukGitmedi = false;
      const hatalar = sonuclar.filter((x) => !x.ok);
      if (kuyruktandi && islenen) {
        new Notice([KART.kuyrukGitti(islenen), hatalar.length ? KART.uygulanamadi(hatalar.length, hatalar[0].metin) : ""].join(" ").trim(), 10_000);
      } else {
        sonuclar.forEach((x, i) => {
          // Destek ve oy sessiz (düğme gösterir); bildirim ve öneri sitedeki gibi sonuç metniyle.
          if (!x.ok || !["destek", "sinif"].includes(gonderilen[i].tur)) if (x.metin) new Notice(`${this.m.ad}: ${x.metin}`, 8_000);
        });
      }
      for (const s of new Set([n, ...gonderilen.slice(0, islenen).map((x) => x.sure)])) {
        if (s !== n) {
          this.durumlar.delete(s);
          this.katmanDurum.delete(s);
        }
        if (islenen) this.katman(s, true);
      }
    } finally {
      this.eylemSuruyor = false;
      this.eylemSurumu++;
      this.yenidenCiz();
      const [sonraki] = this.durumSira;
      if (sonraki !== undefined) {
        this.durumSira.delete(sonraki);
        this.eylemTur(sonraki);
      }
    }
  }

  /**
   * Telefonda dipnot (1.17.2, o194): tanım etkin sayfanın metninden (`[^id]: …`, meal kutusunda `> > ` önekli) okunur,
   * küçük pencerede çizilir; uzun surede sayfa sonu listesi henüz çizilmemiş olabilir, DOM'a bakılmaz. Başlık mealin adı.
   */
  async dipnotPenceresi(a) {
    const f = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const id = a.dataset.footref;
    if (!f || !id) return;
    const kacis = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tanim = new RegExp(`^(?:>[ \\t]?)*\\[\\^${kacis}\\]:[ \\t]?(.*)$`, "m").exec(await this.app.vault.cachedRead(f))?.[1];
    if (tanim === undefined) return;
    const m = new Modal(this.app);
    this.sonPencere = m;
    const meal = a.closest('.callout[data-callout^="translation-"]')?.querySelector(".callout-title-inner")?.textContent;
    m.titleEl.setText([meal, a.textContent].filter(Boolean).join(" "));
    m.contentEl.addClass("lq-modal");
    await MarkdownRenderer.render(this.app, tanim, m.contentEl, f.path, this);
    m.open();
  }

  /** Pencere iskeleti (Obsidian `Modal`, mobilde de çalışır): başlık, alanlar, Cancel + ana düğme. */
  pencere(baslik, kur) {
    const m = new Modal(this.app);
    this.sonPencere = m; // CDP sınaması bulsun: Obsidian pencereyi ayrı bir belgede açabiliyor (is-popout-modal, o149)
    m.titleEl.setText(baslik);
    m.contentEl.addClass("lq-modal");
    const alan = (etiket) => {
      const d = m.contentEl.createDiv({ cls: "lq-modal-field" });
      d.createDiv({ cls: "lq-modal-label", text: etiket });
      return d;
    };
    const altlik = createDiv({ cls: "modal-button-container" });
    const { gonder, metin, hazir, odak } = kur({ m, alan });
    const ana = altlik.createEl("button", { text: metin, cls: "mod-cta" });
    altlik.createEl("button", { text: KART.vazgec }).onclick = () => m.close();
    const tazele = () => (ana.disabled = !hazir());
    ana.onclick = () => {
      if (!hazir()) return;
      gonder();
      m.close();
    };
    m.contentEl.append(altlik);
    m.contentEl.addEventListener("input", tazele);
    m.contentEl.addEventListener("click", () => window.setTimeout(tazele));
    tazele();
    m.open();
    odak?.focus(); // 1.15.0: zamanlayıcısız (o172), açılınca ilk alan
    return m;
  }

  /** Tekli seçim çipleri; ilki seçili gelir. */
  secimCipleri(ust, secenekler) {
    const kap = ust.createDiv({ cls: "lq-modal-chips" });
    let secili = secenekler[0]?.slug ?? null;
    for (const r of secenekler) {
      const b = kap.createEl("button", { cls: "lq-chip", text: r.ad, attr: { "aria-pressed": String(r.slug === secili) } });
      b.onclick = () => {
        secili = r.slug;
        for (const x of kap.children) x.setAttr("aria-pressed", String(x === b));
      };
    }
    return () => secili;
  }

  bildirPenceresi(s, o) {
    this.pencere(KART.bildirBaslik(o.metin), ({ alan }) => {
      const t = alan(KART.bildirSoru).createEl("textarea", { attr: { rows: 3, maxlength: 2000, "aria-label": KART.bildirSoru } });
      return {
        odak: t,
        metin: KART.bildirGonder,
        hazir: () => t.value.trim() !== "",
        gonder: () => this.eylem(s, { tur: "bildir", hedef: o.ref, gerekce: t.value.trim() }),
      };
    });
  }

  /** Üyelik önerisi (sitedeki düğüm sayfası formu): ayet, rol, kelime çipleri, not. */
  uyelikPenceresi(s, a, o, k) {
    this.pencere(KART.uyeBaslik(o.metin), ({ alan }) => {
      const ayet = alan(KART.ayet).createEl("input", { type: "text", attr: { placeholder: KART.ayetIpucu, "aria-label": KART.ayet } });
      const rol = this.secimCipleri(alan(KART.rol), k.roller);
      const kelimeAlan = alan(k.kelime === "zorunlu" ? KART.kelimeZorunlu : KART.kelimeIstege);
      const cipler = kelimeAlan.createDiv({ cls: "lq-modal-chips lq-modal-words", attr: { dir: "rtl", lang: "ar" } });
      const not = alan(KART.notAlan).createEl("input", { type: "text", attr: { "aria-label": KART.notAlan, maxlength: 1000 } });
      kelimeAlan.parentElement.createEl("p", { cls: "lq-panel-hint", text: KART.oneriUyari });
      let aralik = null;
      let yuklu = null;
      const kelimeCiz = (liste) => {
        cipler.empty();
        (liste ?? []).forEach((w, i) => {
          const b = cipler.createEl("button", { cls: "lq-chip", text: w[1], attr: { title: w[3] ?? "" } });
          const konum = i + 1;
          b.setAttr("aria-pressed", String(!!aralik && konum >= aralik[0] && konum <= aralik[1]));
          b.onclick = () => {
            aralik = kelimeSec(aralik, konum);
            kelimeCiz(liste);
          };
        });
      };
      ayet.addEventListener("input", async () => {
        const ref = ayetCoz(ayet.value);
        if (ref === yuklu) return;
        yuklu = ref;
        aralik = null;
        kelimeCiz([]);
        if (!ref) return;
        const [hs, ha] = ref.split(":").map(Number);
        const liste = await this.ayetKelimeleri(hs, ha);
        if (yuklu === ref) kelimeCiz(liste);
      });
      return {
        odak: ayet,
        metin: KART.oner,
        hazir: () => !!ayetCoz(ayet.value) && !!rol() && (k.kelime !== "zorunlu" || !!aralik),
        gonder: () => {
          const ref = ayetCoz(ayet.value);
          this.eylem(Number(ref.split(":")[0]), {
            tur: "uyelik", dugum: o.dugum, ayet: ref, rol: rol(),
            ...(not.value.trim() ? { not: not.value.trim() } : {}),
            ...(aralik ? { kelime: aralik } : {}),
          });
        },
      };
    });
  }

  /** İlişki önerisi (sitedeki ayet sayfası formu): karşı ayet, işlev, gerekçe. */
  iliskiPenceresi(s, a, roller) {
    this.pencere(KART.iliskiBaslik(`${s}:${a}`), ({ alan }) => {
      const ayet = alan(KART.karsiAyet).createEl("input", { type: "text", attr: { placeholder: KART.ayetIpucu, "aria-label": KART.karsiAyet } });
      const islev = this.secimCipleri(alan(KART.islev), roller);
      const not = alan(KART.neden).createEl("input", { type: "text", attr: { "aria-label": KART.neden, maxlength: 1000 } });
      return {
        odak: ayet,
        metin: KART.iliskiGonder,
        hazir: () => !!ayetCoz(ayet.value) && ayetCoz(ayet.value) !== `${s}:${a}` && !!islev(),
        gonder: () => this.eylem(s, {
          tur: "iliski", kaynak: `${s}:${a}`, ayet: ayetCoz(ayet.value), islev: islev(),
          ...(not.value.trim() ? { not: not.value.trim() } : {}),
        }),
      };
    });
  }

  /** Bir ayetin kelimeleri: sitenin statik dosyası (`UyelikOnerForm`un aynısı), anahtarları ayet kimliği sırasında. */
  async ayetKelimeleri(s, a) {
    if (!this.kelimeler.has(s)) {
      try {
        const y = await requestUrl({ url: `${this.ayar.adres.replace(/\/+$/, "")}/kuran/kelime/${s}.json`, throw: false });
        if (y.status !== 200) return null;
        this.kelimeler.set(s, Object.values(JSON.parse(y.text)));
      } catch {
        return null;
      }
    }
    return this.kelimeler.get(s)[a - 1] ?? null;
  }

  /** Durum çubuğu; metni döner (komutta bildirim olarak da gösterilir). */
  cubuk() {
    const d = this.sonDurum;
    if (!d) return "";
    const bilinen = ["yayim_yetkisi_yok", "toplu_silme_durdu"];
    const diger = d.kodlar.filter((k) => !bilinen.includes(k)).length;
    const p = [diger ? `${this.m.ad} ⚠ ${diger}` : this.m.tamam(d.saat, d.n)];
    if (d.cakisma) p.push(this.m.cakisma(d.cakisma));
    if (d.kodlar.includes("yayim_yetkisi_yok")) p.push(this.m.yetkiYok);
    if (d.kodlar.includes("toplu_silme_durdu")) p.push(this.m.toplu);
    if (this.yazilacak.size) p.push(this.m.bekliyor(this.yazilacak.size));
    this.durum.setText(p.join(" · "));
    return p.join(" · ");
  }
};

/** `/3:7` → ayet bağlantısı + ilişki (sitedeki `/` menüsü gibi). Yalnız sure sayfalarında. */
class AyetOnerisi extends EditorSuggest {
  constructor(app, eklenti) {
    super(app);
    this.eklenti = eklenti;
  }

  onTrigger(imlec, editor, file) {
    if (!file || !this.eklenti.yer(file)) return null;
    const t = egikTetik(editor.getLine(imlec.line).slice(0, imlec.ch));
    // Olmayan ayet önerilmez (site o104): sure kasadaysa ayetin `## a` başlığı olmalı.
    if (!t || this.eklenti.ayetYok(t.s, t.b ?? t.a)) return null;
    this.tetik = t;
    return { start: { line: imlec.line, ch: imlec.ch - t.uzunluk }, end: imlec, query: `${t.s}:${t.a}` };
  }

  getSuggestions() {
    return [["", ""], ...ILISKILER].map(([kelime, aciklama]) => ({ ...this.tetik, kelime, aciklama }));
  }

  renderSuggestion(x, el) {
    const ref = `${x.s}:${x.a}${x.b ? `-${x.b}` : ""}`;
    el.createDiv({ text: `${ref} · ${x.kelime || KART.ilisiksiz}` });
    if (x.aciklama) el.createDiv({ cls: "lq-suggestion-desc", text: x.aciklama });
  }

  selectSuggestion(x) {
    const { editor, start, end, file } = this.context;
    const bag = this.eklenti.ayetBaglantisi(x.s, x.a, x.b, file.path);
    editor.replaceRange(`${bag}${x.kelime ? ` %%${x.kelime}%%` : ""} `, start, end);
  }
}

// Lint `prefer-setting-definitions` uyarısı bilerek açık (satır içi kapatılamıyor): bildirimsel ayar API'si 1.13+ ve
// ekranı o tanımlardan çizer; minAppVersion 1.8.7 için ikinci bir ayar yolu yazılmaz (o182).
class Ayarlar extends PluginSettingTab {
  constructor(app, eklenti) {
    super(app, eklenti);
    this.eklenti = eklenti;
  }

  display() {
    const { containerEl } = this;
    const e = this.eklenti;
    this.ilk ??= JSON.stringify(e.ayar.metin ?? null); // display kendini yeniden çağırır: ekran açılınca bir kez (1.12.0)
    containerEl.empty();
    new Setting(containerEl)
      .setName(e.m.anahtar)
      .setDesc(e.m.anahtarAcikla)
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder(`${ANAHTAR_ONEK}…`)
          .setValue(e.ayar.anahtar)
          .onChange(async (v) => {
            e.ayar.anahtar = v.trim();
            e.hepsi = true; // yeni anahtarla bütün notlar bir kez gitsin
            await e.saveData(e.ayar);
            e.zamanla();
            e.yenidenCiz(); // 1.15.0: anahtara bağlı düğmeler (muhkem, eylem) hemen (o170)
          });
      });
    new Setting(containerEl)
      .setName(e.m.adres)
      .setDesc(e.m.adresAcikla)
      .addText((t) =>
        t.setValue(e.ayar.adres).onChange(async (v) => {
          e.ayar.adres = v.trim() || VARSAYILAN.adres;
          e.katalog = null;
          await e.saveData(e.ayar);
        }),
      );

    // Kasadaki metin (1.11.0, o166): seçim burada, yazma «Site metnini yenile» ile.
    new Setting(containerEl).setName(e.m.metinBaslik).setDesc(e.m.metinAcikla).setHeading();
    const katalog = e.katalog;
    if (!katalog) {
      const s = new Setting(containerEl).setDesc("…");
      e.katalogAl().then((k) => (k ? this.display() : s.setDesc(e.m.katalogYok)));
      return;
    }
    const cikan = e.metinAyari(katalog);
    if (cikan.kod) new Setting(containerEl).setDesc(e.m.ayarOkunamadi(cikan.parca));
    const metin = cikan.kod ? { arapca: true, kelime: "", mealler: [] } : { ...cikan, mealler: [...cikan.mealler] };
    const kaydet = async () => {
      e.ayar.metin = metin;
      await e.saveData(e.ayar);
    };
    const etiket = (t) => `${t.language.toUpperCase()} · ${t.name}${t.edition ? ` · ${t.edition}` : ""}`;
    new Setting(containerEl).setName(e.m.mealler);
    metin.mealler.forEach((slug, i) => {
      const t = katalog.find((x) => x.slug === slug);
      new Setting(containerEl).setName(`${i + 1}. ${t ? etiket(t) : slug}`).addExtraButton((b) =>
        b.setIcon("x").setTooltip(e.m.kaldir).onClick(async () => {
          metin.mealler.splice(i, 1);
          await kaydet();
          this.display();
        }),
      );
    });
    if (metin.mealler.length < 5) {
      new Setting(containerEl).setName(e.m.mealEkle).addDropdown((d) => {
        d.addOption("", "—");
        for (const t of [...katalog].sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name)))
          if (!metin.mealler.includes(t.slug)) d.addOption(t.slug, etiket(t));
        d.onChange(async (v) => {
          if (!v) return;
          metin.mealler.push(v);
          await kaydet();
          this.display();
        });
      });
    }
    // 1.16.0: quran.com iki dili + sitenin kelime kaynakları (`dizin.json` `kelimeKaynaklari`).
    new Setting(containerEl).setName(e.m.kelime).addDropdown((d) => {
      d.addOption("", e.m.yok).addOption("en", "EN · quran.com").addOption("tr", "TR · quran.com");
      for (const k of e.kelimeKaynaklari ?? []) d.addOption(k.slug, `${k.language.toUpperCase()} · ${k.name}`);
      d.setValue(metin.kelime).onChange(async (v) => {
        metin.kelime = v;
        await kaydet();
      });
    });
    new Setting(containerEl).setName(e.m.arapca).addToggle((t) =>
      t.setValue(metin.arapca).onChange(async (v) => {
        metin.arapca = v;
        await kaydet();
      }),
    );
    new Setting(containerEl).setName(e.m.tazele).addButton((b) => b.setButtonText(e.m.tazeleEvet).setCta().onClick(() => e.siteMetni()));
  }

  /** Ekran kapanınca: metin seçimi değiştiyse bir kez yenileme sorulur (1.12.0). */
  hide() {
    super.hide?.();
    const ilk = this.ilk;
    this.ilk = undefined;
    this.eklenti.ayarKapandi(ilk);
  }
}
