// This file intentionally localizes the application shell only. Content pages keep their original text.
export const MENU_LANGUAGE_KEY = 'hongguo.menu.language';
export const DEFAULT_MENU_LANGUAGE = 'vi';

const LABELS = {
  vi: {
    menu: {
      browse: 'Khám phá phim',
      feed: 'Phim nổi bật',
      download: 'Tìm kiếm và tải',
      player: 'Thư viện phim',
      history: 'Lịch sử xem',
      calendar: 'Theo dõi phim mới',
      manager: 'Quản lý tải xuống',
      account: 'Tài khoản Hongguo',
      settings: 'Cài đặt',
    },
    brand: 'Hongguo Downloader',
    tagline: 'Phim hay mỗi ngày',
    previewTagline: 'Dữ liệu lưu riêng trên máy',
    group: 'Nội dung',
    preview: 'Bản xem trước',
    mainNavigation: 'Điều hướng chính',
    portraitNavigation: 'Điều hướng dọc',
    switchPage: 'Chuyển trang',
    playerCompact: 'Chế độ cửa sổ nhỏ',
    episodePick: 'Chọn tập',
    episodeCollapse: 'Ẩn danh sách tập',
    showButtons: 'Hiện nút',
    hideButtons: 'Ẩn nút',
    restoreBorder: 'Hiện viền',
    hideBorder: 'Ẩn viền',
    pin: 'Ghim cửa sổ',
    unpin: 'Bỏ ghim',
    switchLandscape: 'Chuyển giao diện ngang',
    switchPortrait: 'Chuyển giao diện dọc',
    switching: 'Đang chuyển…',
    landscape: 'Bản ngang',
    portrait: 'Bản dọc',
    exitMini: 'Thoát cửa sổ nhỏ',
    miniHint: 'Rời chuột để tạm dừng · Di chuột trở lại để tiếp tục',
    closeNotice: 'Đóng thông báo',
    settingsTitle: 'Cài đặt',
    settingsDescription: 'Tùy chỉnh tải xuống, lưu trữ và kết nối theo ý bạn.',
    languageTitle: 'Ngôn ngữ menu / 菜单语言',
    languageHint: 'Chuyển tức thì và tự lưu cho lần mở sau. Toàn bộ nhãn, thao tác và thông báo trong ứng dụng được Việt hóa; tên phim và nội dung do người dùng nhập được giữ nguyên.',
    languageAria: 'Chọn ngôn ngữ menu',
  },
  zh: {
    menu: {
      browse: '发现短剧',
      feed: '热播推荐',
      download: '搜索与下载',
      player: '我的剧库',
      history: '观看记录',
      calendar: '收藏与上新',
      manager: '下载管理',
      account: '红果账号',
      settings: '设置',
    },
    brand: 'Hongguo Downloader',
    tagline: '每一集，都值得期待',
    previewTagline: '独立体验 · 本机保存',
    group: '内容',
    preview: '功能预览',
    mainNavigation: '主导航',
    portraitNavigation: '竖屏导航',
    switchPage: '切换页面',
    playerCompact: '小窗模式',
    episodePick: '选集',
    episodeCollapse: '收起选集',
    showButtons: '显示按钮',
    hideButtons: '隐藏按钮',
    restoreBorder: '恢复边框',
    hideBorder: '去掉边框',
    pin: '置顶',
    unpin: '取消置顶',
    switchLandscape: '切换横屏版',
    switchPortrait: '切换竖屏版',
    switching: '切换中…',
    landscape: '横屏版',
    portrait: '竖屏版',
    exitMini: '退出小窗',
    miniHint: '移开暂停隐藏 · 移回继续',
    closeNotice: '关闭提示',
    settingsTitle: '设置',
    settingsDescription: '让下载、保存和网络连接，按你的习惯运行。',
    languageTitle: '菜单语言 / Ngôn ngữ menu',
    languageHint: '立即切换并自动保存。越南语模式翻译应用界面、操作提示和状态信息，剧名、影片与用户输入保持原样。',
    languageAria: '选择菜单语言',
  },
};

export function normalizeMenuLanguage(value) {
  return value === 'zh' ? 'zh' : DEFAULT_MENU_LANGUAGE;
}

export function getMenuLabels(language) {
  return LABELS[normalizeMenuLanguage(language)];
}

export function readMenuLanguage(storage) {
  try {
    const target = storage === undefined ? (typeof window === 'undefined' ? null : window.localStorage) : storage;
    return normalizeMenuLanguage(target?.getItem(MENU_LANGUAGE_KEY));
  } catch {
    return DEFAULT_MENU_LANGUAGE;
  }
}

export function writeMenuLanguage(language, storage) {
  const normalized = normalizeMenuLanguage(language);
  try {
    const target = storage === undefined ? (typeof window === 'undefined' ? null : window.localStorage) : storage;
    target?.setItem(MENU_LANGUAGE_KEY, normalized);
  } catch {
    // The current window can still switch language when storage access is restricted.
  }
  return normalized;
}
