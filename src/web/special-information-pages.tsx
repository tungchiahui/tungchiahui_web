import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { PrintResume } from '@/components/print-resume'
import type { AppLocale } from '@/i18n/locales'
import type { messagesForLocale } from '@/i18n/messages'
import { awards, cvProfile, education, experiences } from '@/personal/cv-profile'
import { featuredProjects } from '@/projects/catalog'
import type { PublicDocumentSummary } from '@/server/public-content'
import { ProjectEntries } from './project-pages'
import type { PublicRouteContext } from './routes'
import { withLocalePrefix } from './routes'

const focusAreas = [
  ['focusMobileTitle', 'focusMobileBody', 'focusMobileTags'],
  ['focusPerceptionTitle', 'focusPerceptionBody', 'focusPerceptionTags'],
  ['focusManipulationTitle', 'focusManipulationBody', 'focusManipulationTags'],
  ['focusEmbeddedTitle', 'focusEmbeddedBody', 'focusEmbeddedTags'],
] as const

const roadmap = [
  ['01', 'roadmapChassisTitle', 'roadmapChassisBody'],
  ['02', 'roadmapNavigationTitle', 'roadmapNavigationBody'],
  ['03', 'roadmapVisionTitle', 'roadmapVisionBody'],
  ['04', 'roadmapArmTitle', 'roadmapArmBody'],
] as const

const friends = [
  [
    'friendTeams',
    'friendVinciName',
    'friendVinciBody',
    'https://sdutvincirobot.top/',
    'https://sdutvincirobot.top/images/logo.png',
    'friendCompetitionTag',
  ],
  [
    'friendTeams',
    'friendQiqiName',
    'friendQiqiBody',
    'https://sdutqiqi.cn/',
    'https://sdutqiqi.cn/favicon.ico',
    'friendCompetitionTag',
  ],
  [
    'friendEvents',
    'friendRoboconName',
    'friendRoboconBody',
    'http://robocon.org.cn/',
    'https://30049936.s21i.faiusr.com/4/1/ABUIABAEGAAg6ainyAYo4Yy3pwYwiQM4lgI.png.webp',
    'friendResourceTag',
  ],
  [
    'friendEvents',
    'friendRobomasterName',
    'friendRobomasterBody',
    'https://www.robomaster.com/zh-CN',
    'https://www.robomaster.com/favicon.ico',
    'friendResourceTag',
  ],
  [
    'friendCommunities',
    'friendRcbbsName',
    'friendRcbbsBody',
    'https://rcbbs.top/',
    'https://rcbbs.top/uploads/default/original/2X/c/c2f3581e40102fad7280ee870619dbcc529fd2de.png',
    'friendDiscussionTag',
  ],
  [
    'friendCommunities',
    'friendRmForumName',
    'friendRmForumBody',
    'https://bbs.robomaster.com/',
    'https://www.robomaster.com/favicon.ico',
    'friendDiscussionTag',
  ],
  [
    'friendBloggers',
    'friendCherishName',
    'friendBlogBody',
    'https://cherish.wang/',
    'https://www.cherish.wang/favicon.ico',
    'friendPersonalTag',
  ],
  [
    'friendBloggers',
    'friendTimeName',
    'friendBlogBody',
    'https://blog.ksah.cn/',
    'https://blog.ksah.cn/img/logo.svg',
    'friendPersonalTag',
  ],
] as const

type InformationKey = keyof ReturnType<typeof messagesForLocale>['Web']['information']
type InformationTranslator = (key: InformationKey) => string

export async function AboutInformationPage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const l = await getTranslations({ locale: context.locale, namespace: 'Web.information' })
  return (
    <div className="legacy-info-page">
      <section className="legacy-info-hero">
        <p className="legacy-kicker">{l('aboutKicker')}</p>
        <h1>{l('aboutTitle')}</h1>
        <p>{l('aboutIntro')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="legacy-primary-link" href={withLocalePrefix('/cv', context)}>
            {l('viewCv')}
          </Link>
          <Link
            className="legacy-secondary-link"
            href={withLocalePrefix('/tech-footprint', context)}
          >
            {l('footprint')}
          </Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={l('keywordsLabel')}>
        {(
          [
            ['keywordSlamValue', 'keywordSlam'],
            ['keywordRosValue', 'keywordRos'],
            ['keywordStmValue', 'keywordStm'],
            ['keywordNextValue', 'keywordNext'],
          ] as const
        ).map(([value, label]) => (
          <div className="legacy-metric" key={value}>
            <strong>{l(value)}</strong>
            <span>{l(label)}</span>
          </div>
        ))}
      </section>
      <InfoSection eyebrow={l('focusKicker')} title={l('focusTitle')} description={l('focusIntro')}>
        <div className="grid gap-4 md:grid-cols-2">
          {focusAreas.map(([title, description, tags]) => (
            <article className="legacy-card" key={title}>
              <h3>{l(title)}</h3>
              <p>{l(description)}</p>
              <small>{l(tags)}</small>
            </article>
          ))}
        </div>
      </InfoSection>
      <InfoSection eyebrow={l('projectKicker')} title={l('roadmapTitle')}>
        <div className="grid gap-3">
          {roadmap.map(([step, title, description]) => (
            <article className="legacy-roadmap" key={step}>
              <strong>{step}</strong>
              <div>
                <h3>{l(title)}</h3>
                <p>{l(description)}</p>
              </div>
            </article>
          ))}
        </div>
      </InfoSection>
      <InfoSection
        eyebrow={l('contentKicker')}
        title={l('contentTitle')}
        description={l('contentIntro')}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <ContentLink
            href={withLocalePrefix('/blog', context)}
            title={l('blog')}
            body={l('blogBody')}
          />
          <ContentLink
            href={withLocalePrefix('/wiki', context)}
            title={l('wiki')}
            body={l('wikiBody')}
          />
          <ContentLink
            href={withLocalePrefix('/tech-footprint', context)}
            title={l('footprint')}
            body={l('footprintBody')}
          />
        </div>
      </InfoSection>
      <InfoSection eyebrow={l('contactKicker')} title={l('contactTitle')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Contact
            label={l('email')}
            value="tungchiahui@gmail.com"
            href="mailto:tungchiahui@gmail.com"
          />
          <Contact label={l('github')} value="tungchiahui" href="https://github.com/tungchiahui" />
          <Contact label={l('qq')} value="2225279276" />
          <Contact label={l('wechat')} value="tungchiahui" />
        </div>
      </InfoSection>
    </div>
  )
}

export async function CvInformationPage({
  context,
  projects = [],
}: Readonly<{ context: PublicRouteContext; projects?: readonly PublicDocumentSummary[] }>) {
  const l = await getTranslations({ locale: context.locale, namespace: 'Web.information' })
  const t = await getTranslations({ locale: context.locale, namespace: 'Web.portfolio' })
  const selected = featuredProjects(projects)
  return (
    <div className="legacy-info-page cv-page">
      <header className="cv-header">
        <div>
          <h1>{l('name')}</h1>
          <p className="cv-focus">{l('cvFocus')}</p>
          <p className="cv-affiliation">{l('cvAffiliation')}</p>
          <p className="cv-intro">{l('cvIntro')}</p>
          <nav className="cv-contact-links" aria-label={l('contactDetails')}>
            <a href={`mailto:${cvProfile.email}`}>{cvProfile.email}</a>
            <a href={cvProfile.github} rel="noreferrer" target="_blank">
              {l('github')}
            </a>
            <PrintResume label={t('printResume')} />
          </nav>
          <p className="cv-secondary-contact">
            {l('wechat')}: {cvProfile.wechat} <span aria-hidden>·</span> {l('qq')}: {cvProfile.qq}
          </p>
        </div>
        <figure>
          {/* biome-ignore lint/performance/noImgElement: approved public CDN portrait */}
          <img alt={l('portraitAlt')} src={cvProfile.portrait} width="132" height="160" />
          <figcaption>
            {l('portraitCaption')}
            <span>{l('portraitFocus')}</span>
          </figcaption>
        </figure>
      </header>
      <section className="cv-section" aria-labelledby="cv-project-heading">
        <div className="cv-section-heading">
          <h2 id="cv-project-heading">{t('selectedProjects')}</h2>
          <Link href={withLocalePrefix('/projects', context)}>{t('allProjects')} →</Link>
        </div>
        {selected.length ? (
          await ProjectEntries({ context, documents: selected, compact: true })
        ) : (
          <p className="cv-empty">{t('selectedEmpty')}</p>
        )}
      </section>
      <TimelineSection items={experiences} l={l} title={l('experienceTitle')} />
      <TimelineSection items={education} l={l} title={l('educationTitle')} />
      <section className="cv-section">
        <h2>{l('skills')}</h2>
        <p className="cv-skills">{l('skillsList').split(',').join(' · ')}</p>
      </section>
      <section className="cv-section">
        <h2>{l('awardsTitle')}</h2>
        <p className="cv-awards-summary">
          {l('metricAwards')}: {l('metricAwardsValue')} · {l('metricTraining')}:{' '}
          {l('metricTrainingValue')}
        </p>
        <ul className="cv-awards">
          {awards.map((award) => (
            <li key={award}>{l(award)}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export async function FriendInformationPage({ locale }: Readonly<{ locale: AppLocale }>) {
  const l = await getTranslations({ locale, namespace: 'Web.information' })
  const categories = [...new Set(friends.map(([category]) => category))]
  return (
    <div className="legacy-info-page">
      <header className="legacy-info-hero">
        <p className="legacy-kicker">{l('friendsKicker')}</p>
        <h1>{l('friendsTitle')}</h1>
        <p>{l('friendsIntro')}</p>
      </header>
      {categories.map((category) => (
        <InfoSection key={category} title={l(category)}>
          <div className="grid gap-4 md:grid-cols-2">
            {friends
              .filter(([group]) => group === category)
              .map(([, name, description, url, icon, tag]) => (
                <a
                  className="friend-rich-card"
                  href={url}
                  key={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {/* biome-ignore lint/performance/noImgElement: friend icons are external content */}
                  <img alt="" src={icon} />
                  <div className="min-w-0">
                    <h3>{l(name)}</h3>
                    <p>{l(description)}</p>
                    <span>{l(tag)}</span>
                  </div>
                  <ExternalLink aria-hidden="true" size={17} />
                </a>
              ))}
          </div>
        </InfoSection>
      ))}
    </div>
  )
}

export async function LogoInformationPage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const l = await getTranslations({ locale: context.locale, namespace: 'Web.information' })
  const cards = [
    ['T', 'logoTechnicalTitle', 'logoTechnicalBody'],
    ['C', 'logoOpenTitle', 'logoOpenBody'],
    ['H', 'logoSupportTitle', 'logoSupportBody'],
  ] as const
  return (
    <div className="legacy-info-page">
      <Link className="text-primary" href={withLocalePrefix('/more', context)}>
        ← {l('backMore')}
      </Link>
      <section className="logo-rich-hero">
        <div className="logo-rich-image">
          {/* biome-ignore lint/performance/noImgElement: approved public CDN logo */}
          <img
            alt={l('logoAlt')}
            src="https://cdn.tungchiahui.cn/tungwebsite/assets/images/logo.png"
          />
          <strong>{l('logoMark')}</strong>
        </div>
        <div>
          <p className="legacy-kicker">{l('logoKicker')}</p>
          <h1>{l('logoTitle')}</h1>
          <p>{l('logoIntro')}</p>
        </div>
      </section>
      <InfoSection title={l('logoStructureTitle')} description={l('logoStructureBody')}>
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(([letter, title, body]) => (
            <article className="legacy-card" key={letter}>
              <strong className="grid size-12 place-items-center rounded-xl bg-emerald-600 text-2xl text-white">
                {letter}
              </strong>
              <h3 className="mt-4">{l(title)}</h3>
              <p>{l(body)}</p>
            </article>
          ))}
        </div>
      </InfoSection>
      <InfoSection title={l('logoGreenTitle')} description={l('logoGreenBody')} />
      <InfoSection title={l('logoAttitudeTitle')} description={l('logoAttitudeBody')} />
    </div>
  )
}

function InfoSection({
  children,
  description,
  eyebrow,
  title,
}: Readonly<{
  children?: React.ReactNode
  description?: string
  eyebrow?: string
  title: string
}>) {
  return (
    <section className="legacy-info-section">
      {eyebrow ? <p className="legacy-kicker">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p className="legacy-section-description">{description}</p> : null}
      {children}
    </section>
  )
}
function ContentLink({
  body,
  href,
  title,
}: Readonly<{ body: string; href: string; title: string }>) {
  return (
    <Link className="legacy-card" href={href}>
      <h3>{title}</h3>
      <p>{body}</p>
      <span className="text-primary">→</span>
    </Link>
  )
}
function Contact({
  href,
  label,
  value,
}: Readonly<{ href?: string; label: string; value: string }>) {
  const body = (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <strong className="break-all">{value}</strong>
    </>
  )
  return href ? (
    <a className="legacy-contact" href={href} rel="noreferrer" target="_blank">
      {body}
    </a>
  ) : (
    <div className="legacy-contact">{body}</div>
  )
}
function TimelineSection({
  items,
  l,
  title,
}: Readonly<{
  items: readonly (readonly [InformationKey, InformationKey, InformationKey, InformationKey])[]
  l: InformationTranslator
  title: string
}>) {
  return (
    <InfoSection title={title}>
      <div className="grid gap-4">
        {items.map(([period, name, role, description]) => (
          <article className="legacy-timeline" key={`${period}-${name}`}>
            <time>{l(period)}</time>
            <div>
              <h3>{l(name)}</h3>
              <strong>{l(role)}</strong>
              <p>{l(description)}</p>
            </div>
          </article>
        ))}
      </div>
    </InfoSection>
  )
}
