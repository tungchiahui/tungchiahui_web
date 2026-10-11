import { createTranslator } from 'next-intl'
import type { AppLocale } from '../i18n/locales'
import { messagesForLocale } from '../i18n/messages'
import type { StartPayload } from './contracts'

export function createDefaultStartPayload(locale: AppLocale): StartPayload {
  const t = createTranslator({
    locale,
    messages: messagesForLocale(locale),
    namespace: 'Web.startDefaults',
  })
  return {
    version: 1,
    sections: [
      {
        title: t('daily'),
        items: [
          {
            id: 'tool-gmail',
            name: 'Gmail',
            desc: t('gmail'),
            url: 'https://mail.google.com',
            color: '#ef5b4d',
          },
          {
            id: 'tool-github',
            name: 'GitHub',
            desc: t('github'),
            url: 'https://github.com',
            color: '#6f66d8',
          },
          {
            id: 'tool-notion',
            name: 'Notion',
            desc: t('notion'),
            url: 'https://notion.so',
            color: '#2f3437',
          },
          {
            id: 'tool-chatgpt',
            name: 'ChatGPT',
            desc: t('chatgpt'),
            url: 'https://chat.openai.com',
            color: '#10a37f',
          },
        ],
      },
      {
        title: t('development'),
        items: [
          {
            id: 'dev-mdn',
            name: 'MDN',
            desc: t('mdn'),
            url: 'https://developer.mozilla.org',
            color: '#2f80ed',
          },
          {
            id: 'dev-stack',
            name: 'Stack Overflow',
            desc: t('stack'),
            url: 'https://stackoverflow.com',
            color: '#f48225',
          },
          {
            id: 'dev-caniuse',
            name: 'Can I Use',
            desc: t('caniuse'),
            url: 'https://caniuse.com',
            color: '#7bbf47',
          },
        ],
      },
      {
        title: t('reading'),
        items: [
          {
            id: 'read-hn',
            name: 'Hacker News',
            desc: t('hn'),
            url: 'https://news.ycombinator.com',
            color: '#ff6600',
          },
          {
            id: 'read-v2ex',
            name: 'V2EX',
            desc: t('v2ex'),
            url: 'https://www.v2ex.com',
            color: '#308eda',
          },
          {
            id: 'read-zhihu',
            name: t('zhihuName'),
            desc: t('zhihu'),
            url: 'https://www.zhihu.com',
            color: '#0084ff',
          },
        ],
      },
    ],
    history: [],
    engine: 'baidu',
    background: 0,
    detailed: false,
  }
}
export const defaultStartPayload = createDefaultStartPayload('zh-cn')
