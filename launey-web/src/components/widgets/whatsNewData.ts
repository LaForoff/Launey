import introBackground from '../../assets/whats-new/intro/ch-bg-dark.png'
import introVersionBackground from '../../assets/whats-new/intro/0.1.5.svg'
import introLogo from '../../assets/whats-new/intro/logo-version-center.png'
import foldersFeatureImage from '../../assets/whats-new/folders-feature.png'

export interface WhatsNewIntroData {
  version: string
  title: string
  description: string
  image: string
  versionBackground: string
  logo: string
}

export interface WhatsNewStepData {
  version: string
  eyebrow: string
  title: string
  description: string
  image: string
  versionBackground: string
  logo: string
  step: number
}

export interface WhatsNewOutroData {
  version: string
  eyebrow: string
  title: string
  description: string
  panelTitle: string
  messages: string[]
  versionBackground: string
  logo: string
}

export type WhatsNewPageData =
  | {
      id: string
      type: 'intro'
      intro: WhatsNewIntroData
    }
  | {
      id: string
      type: 'step'
      step: WhatsNewStepData
    }
  | {
      id: string
      type: 'outro'
      outro: WhatsNewOutroData
    }

export const WHATS_NEW_INTRO_PAGE: WhatsNewPageData = {
  id: 'intro-0-1-5',
  type: 'intro',
  intro: {
    version: '0.1.5',
    title: 'Привет, ты уже в новой версии',
    description:
      'Советую почитать, что изменилось, а если нет времени, то сможешь прочитать потом в настройках.',
    image: introBackground,
    versionBackground: introVersionBackground,
    logo: introLogo,
  },
}

export const WHATS_NEW_FOLDERS_STEP: WhatsNewPageData = {
  id: 'folders-0-1-5',
  type: 'step',
  step: {
    version: '0.1.5',
    eyebrow: 'А ВОТ, ЧТО НОВОГО',
    title: 'Создавать папки стало проще?',
    description:
      'Именно! Перетащите одну иконку на другую и получите папку. Уже видели такое? Я тоже видел, но теперь это есть и у нас!',
    image: foldersFeatureImage,
    versionBackground: introVersionBackground,
    logo: introLogo,
    step: 1,
  },
}

export const WHATS_NEW_STEP_PAGES = [WHATS_NEW_FOLDERS_STEP]

export const WHATS_NEW_OUTRO_PAGE: WhatsNewPageData = {
  id: 'outro-0-1-5',
  type: 'outro',
  outro: {
    version: '0.1.5',
    eyebrow: 'А ВОТ, ЧТО НОВОГО',
    title: 'Много фиксов, правок и прочего для лучшей работы',
    description:
      'Тут собран список всех улучшений, писать про каждый не было особого смысла, но считаю, что не упомянуть это было нельзя.',
    panelTitle: 'Воооот сколько всего было сделано, а вы бы даже не узнали, если бы сразу пропустили...',
    messages: [
      'Система папок полностью переработана: создание, редактирование и сортировка стали проще и плавнее.',
      'Иконки получили единый стиль, а обновлённый Launey Labs позволяет точнее настраивать их внешний вид.',
      'Добавлен выбор поисковой системы, а поиск иконок теперь понимает название и адрес сайта.',
      'Светлая и тёмная темы получили обновлённые цвета, материалы и более цельное оформление окон.',
      'Яркость загруженного фона анализируется автоматически, чтобы текст оставался хорошо читаемым.',
      'Добавлены новый экран запуска, плавные переходы и более наглядный список изменений.',
      'Обновлена интеграция со Sparkle: проверка и установка новых версий стали понятнее.',
    ],
    versionBackground: introVersionBackground,
    logo: introLogo,
  },
}

export const WHATS_NEW_PAGES: WhatsNewPageData[] = [
  WHATS_NEW_INTRO_PAGE,
  ...WHATS_NEW_STEP_PAGES,
  WHATS_NEW_OUTRO_PAGE,
]
