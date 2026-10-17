import { getTranslations } from 'next-intl/server'
import type { AppLocale } from '@/i18n/locales'
import { cvProfile } from '@/personal/cv-profile'

export async function ContactPage({ locale }: Readonly<{ locale: AppLocale }>) {
  const t = await getTranslations({ locale, namespace: 'Web.portfolio' })
  const l = await getTranslations({ locale, namespace: 'Web.information' })

  return (
    <section className="contact-page" aria-labelledby="contact-heading">
      <h1 id="contact-heading">{t('contact')}</h1>
      <p>{t('contactIntro')}</p>
      <dl className="contact-details">
        <div>
          <dt>{l('email')}</dt>
          <dd>
            <a href={`mailto:${cvProfile.email}`}>{cvProfile.email}</a>
          </dd>
        </div>
        <div>
          <dt>{l('github')}</dt>
          <dd>
            <a href={cvProfile.github} rel="noreferrer" target="_blank">
              {cvProfile.githubName}
            </a>
          </dd>
        </div>
        <div>
          <dt>{l('wechat')}</dt>
          <dd>{cvProfile.wechat}</dd>
        </div>
        <div>
          <dt>{l('qq')}</dt>
          <dd>{cvProfile.qq}</dd>
        </div>
      </dl>
    </section>
  )
}
