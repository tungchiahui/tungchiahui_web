import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { localizeContentText } from '@/i18n/content'
import type { AppLocale } from '@/i18n/locales'
import type { PublicRouteContext } from './routes'
import { withLocalePrefix } from './routes'

const focusAreas = [
  [
    '移动机器人',
    '围绕四轮麦克纳姆 AMR 做底盘控制、里程计融合、SLAM 建图、AMCL 定位与 NAV2 路径规划。',
    'AMR · Mecanum · NAV2 · AMCL',
  ],
  [
    '三维建图与感知',
    '把 3D 建图、2D 导航、激光雷达、IMU、相机和 YOLO 识别串成一个能落地调试的机器人系统。',
    '3D Mapping · LiDAR · YOLO · OpenCV',
  ],
  [
    '机械臂与操作',
    '继续学习 MoveIt2、机器人运动学与 ROS2 control，让移动底盘、机械臂和视觉任务协同工作。',
    'MoveIt2 · Kinematics · ROS2 Control',
  ],
  [
    '嵌入式与实时控制',
    '持续深化 STM32、FreeRTOS、CAN、PID、电机控制和传感器调试能力，让上层算法真正接得住硬件。',
    'STM32 · FreeRTOS · CAN · PID',
  ],
] as const

const roadmap = [
  [
    '01',
    '四轮麦克纳姆 AMR 底盘',
    '完成全向运动解算、底盘闭环控制、轮式里程计、IMU 与激光雷达数据接入。',
  ],
  [
    '02',
    'ROS2 导航与建图系统',
    '围绕 SLAM、AMCL、NAV2、TF 坐标变换和 RViz2 调试建立可复用导航流程。',
  ],
  [
    '03',
    '3D 建图与视觉识别',
    '引入三维点云建图与 YOLO 目标识别，让机器人不仅能走，也能理解环境中的对象。',
  ],
  [
    '04',
    'MoveIt2 机械臂联动',
    '把移动平台、机械臂规划和视觉感知组合为面向真实任务的移动操作系统。',
  ],
] as const

const friends = [
  [
    '高校团队',
    'Vinci机器人队',
    '山东理工大学 CURC-Robocon 团队',
    'https://sdutvincirobot.top/',
    'https://sdutvincirobot.top/images/logo.png',
    '竞赛',
  ],
  [
    '高校团队',
    '齐奇战队',
    '山东理工大学 CURC-RoboMaster 团队',
    'https://sdutqiqi.cn/',
    'https://sdutqiqi.cn/favicon.ico',
    '竞赛',
  ],
  [
    '赛事',
    'CURC-Robocon赛事官网',
    '全国大学生机器人大赛 RC 官方站点',
    'http://robocon.org.cn/',
    'https://30049936.s21i.faiusr.com/4/1/ABUIABAEGAAg6ainyAYo4Yy3pwYwiQM4lgI.png.webp',
    '资源',
  ],
  [
    '赛事',
    'CURC-RoboMaster赛事官网',
    '全国大学生机器人大赛 RM 官方站点',
    'https://www.robomaster.com/zh-CN',
    'https://www.robomaster.com/favicon.ico',
    '资源',
  ],
  [
    '社区',
    'RCBBS-Robocon开源论坛',
    '开源机器人与 RC 社区',
    'https://rcbbs.top/',
    'https://rcbbs.top/uploads/default/original/2X/c/c2f3581e40102fad7280ee870619dbcc529fd2de.png',
    '讨论',
  ],
  [
    '社区',
    'RoboMaster开源论坛',
    '开源机器人与 RM 社区',
    'https://bbs.robomaster.com/',
    'https://www.robomaster.com/favicon.ico',
    '讨论',
  ],
  [
    '博主',
    'Cherish个人博客',
    '记录生活，分享知识，定格美好',
    'https://cherish.wang/',
    'https://www.cherish.wang/favicon.ico',
    '个人',
  ],
  [
    '博主',
    '时光驿站',
    '记录生活，分享知识，定格美好',
    'https://blog.ksah.cn/',
    'https://blog.ksah.cn/img/logo.svg',
    '个人',
  ],
] as const

const education = [
  [
    '2021.09 - 2025.06',
    '山东理工大学',
    '机械工程学院 · 机械电子工程（机器人工程方向）',
    '智育专业排名前 20%（18/119），综测专业排名前 10%（14/119）。主修 ROS1 机器人建图与导航、单片机控制、机器人运动控制、PLC、C 语言与电工电子技术。',
  ],
  [
    '硕士阶段',
    '燕山大学',
    '电气工程学院自动化系 · 人工智能硕士',
    '研究方向：SLAM、三维建图、机器人自主导航与智能感知。',
  ],
] as const

const experiences = [
  [
    '2022.06 - 2023.07',
    '第二十二届全国大学生机器人大赛 Robocon',
    '队长兼电控组组长',
    '负责机器人电控系统与研发统筹，基于 STM32、FreeRTOS、CAN 和 PID 完成 AGV 舵轮及麦克纳姆底盘方案，融合 IMU 实现航向校正与定位。',
  ],
  [
    '2023.07 - 2024.07',
    '四轮麦克纳姆 AMR 自主导航系统',
    '项目负责人 / 控制与导航开发',
    '基于 ROS2 融合轮式里程计、IMU 与激光雷达，完成 SLAM 建图、AMCL 定位、NAV2 路径规划及 Gazebo / RViz2 仿真调试流程。',
  ],
  [
    '2021.10 - 2024.07',
    'Vinci 机器人队 / 机电创新学会社团 / 智能机器人实验室',
    '队长兼社团会长',
    '负责团队管理、技术建设与人才培养，组织 20 余场培训并编写 10 余篇技术文档，建立新人培养和知识沉淀机制。',
  ],
] as const

const awards = [
  '第二十三届全国大学生机器人大赛 ROBOCON 个人奖国家级二等奖。',
  '第二十三届全国大学生机器人大赛 ROBOCON 团体奖国家级二等奖。',
  '第二十二届、第二十三届 ROBOCON 团体奖国家级三等奖，共四项。',
  '第二十二届、第二十三届 ROBOCON 个人奖国家级三等奖，共四项。',
  '第十六届全国大学生节能减排社会实践与科技竞赛国家级三等奖。',
  '第九届全国应用型人才综合技能大赛国家级二等奖。',
] as const

function localize(value: string, locale: AppLocale) {
  return localizeContentText(value, locale)
}

export function AboutInformationPage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const l = (value: string) => localize(value, context.locale)
  return (
    <div className="legacy-info-page">
      <section className="legacy-info-hero">
        <p className="legacy-kicker">ABOUT TUNG CHIA-HUI</p>
        <h1>{l('关于我和这个站点')}</h1>
        <p>
          {l(
            '我是董佳辉（Tung Chia-hui）。现在主要关注 SLAM、ROS2 自主导航、三维建图、机器人感知与移动操作系统，也持续保留 STM32、RTOS、CAN 与底盘控制这些贴近硬件的能力。',
          )}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="legacy-primary-link" href={withLocalePrefix('/cv', context)}>
            {l('查看简历')}
          </Link>
          <Link
            className="legacy-secondary-link"
            href={withLocalePrefix('/tech-footprint', context)}
          >
            {l('技术足迹')}
          </Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={l('个人关键词')}>
        {[
          ['SLAM', '主要研究与项目方向'],
          ['ROS2', '机器人系统平台'],
          ['STM32', '嵌入式控制基础'],
          ['Next.js', '本站应用框架'],
        ].map(([value, label]) => (
          <div className="legacy-metric" key={value}>
            <strong>{value}</strong>
            <span>{l(label ?? '')}</span>
          </div>
        ))}
      </section>
      <InfoSection
        eyebrow="FOCUS"
        title={l('现在重点关注的方向')}
        description={l(
          '我希望把“能跑的机器人系统”作为主线，让建图、导航、识别、控制和硬件调试真正连起来。',
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {focusAreas.map(([title, description, tags]) => (
            <article className="legacy-card" key={title}>
              <h3>{l(title)}</h3>
              <p>{l(description)}</p>
              <small>{tags}</small>
            </article>
          ))}
        </div>
      </InfoSection>
      <InfoSection eyebrow="PROJECT LINE" title={l('接下来想做成的机器人项目')}>
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
        eyebrow="CONTENT"
        title={l('这个网站会放什么')}
        description={l(
          '这里既是技术笔记库，也是项目日志和个人成长记录。内容偏工程实践，尽量把踩坑、配置、复盘和路线写清楚。',
        )}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <ContentLink
            href={withLocalePrefix('/blog', context)}
            title={l('博客')}
            body={l('项目复盘、折腾日志、工具经验和阶段性想法。')}
          />
          <ContentLink
            href={withLocalePrefix('/wiki', context)}
            title="Wiki"
            body={l('ROS2、Linux、STM32、FreeRTOS、C/C++、OpenCV、YOLO 等系统化笔记。')}
          />
          <ContentLink
            href={withLocalePrefix('/tech-footprint', context)}
            title={l('技术足迹')}
            body={l('个人机器人技术路线、长期任务清单和项目沉淀。')}
          />
        </div>
      </InfoSection>
      <InfoSection eyebrow="CONTACT" title={l('联系与交流')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Contact
            label="Email"
            value="tungchiahui@gmail.com"
            href="mailto:tungchiahui@gmail.com"
          />
          <Contact label="GitHub" value="tungchiahui" href="https://github.com/tungchiahui" />
          <Contact label="QQ" value="2225279276" />
          <Contact label="WeChat" value="tungchiahui" />
        </div>
      </InfoSection>
    </div>
  )
}

export function CvInformationPage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const l = (value: string) => localize(value, context.locale)
  return (
    <div className="legacy-info-page">
      <section className="cv-rich-hero">
        <div>
          <p className="legacy-kicker">PERSONAL RESUME</p>
          <h1>{context.locale === 'en-us' ? 'Tung Chia-hui' : '董佳辉'}</h1>
          <h2>{l('SLAM 与机器人自主导航方向')}</h2>
          <strong className="text-primary">
            {l('燕山大学电气工程学院自动化系 · 人工智能硕士')}
          </strong>
          <p>
            {l(
              '长期参与机器人竞赛与实验室建设，重点关注 SLAM、三维建图、ROS2 自主导航与机器人智能感知，同时具备 STM32、RTOS、CAN 通信与底盘控制等嵌入式开发能力。',
            )}
          </p>
        </div>
        <figure>
          {/* biome-ignore lint/performance/noImgElement: approved public CDN portrait */}
          <img
            alt="董佳辉 Tung Chia-hui"
            src="https://cdn.tungchiahui.cn/tungwebsite/assets/images/tungchiahui.webp"
          />
          <figcaption>
            Robot systems learner
            <br />
            <span>SLAM / ROS2 / Embedded Control</span>
          </figcaption>
        </figure>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Top 20%', '本科智育专业排名'],
          ['Top 10%', '本科综测专业排名'],
          ['12 项', '国家级竞赛奖项'],
          ['20+ 场', '技术与管理培训'],
        ].map(([value, label]) => (
          <div className="legacy-metric" key={value}>
            <strong>{value}</strong>
            <span>{l(label ?? '')}</span>
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-5">
          <InfoSection title={l('联系方式')}>
            <div className="grid gap-2">
              <Contact
                label="Email"
                value="tungchiahui@gmail.com"
                href="mailto:tungchiahui@gmail.com"
              />
              <Contact label="GitHub" value="tungchiahui" href="https://github.com/tungchiahui" />
              <Contact label="QQ" value="2225279276" />
              <Contact label="WeChat" value="tungchiahui" />
            </div>
          </InfoSection>
          <InfoSection title={l('专业技能')}>
            <div className="flex flex-wrap gap-2">
              {'SLAM,3D Mapping,ROS2,NAV2,AMCL,MoveIt2,YOLO,OpenCV,LiDAR,STM32,FreeRTOS,CAN,PID,C/C++,Linux'
                .split(',')
                .map((tag) => (
                  <span className="legacy-tag" key={tag}>
                    {tag}
                  </span>
                ))}
            </div>
          </InfoSection>
        </aside>
        <main className="grid gap-5">
          <TimelineSection items={education} locale={context.locale} title={l('教育背景')} />
          <TimelineSection items={experiences} locale={context.locale} title={l('个人经历')} />
          <InfoSection title={l('荣誉证书')}>
            <ul className="grid list-disc gap-2 pl-5">
              {awards.map((award) => (
                <li key={award}>{l(award)}</li>
              ))}
            </ul>
          </InfoSection>
        </main>
      </div>
    </div>
  )
}

export function FriendInformationPage({ locale }: Readonly<{ locale: AppLocale }>) {
  const l = (value: string) => localize(value, locale)
  const categories = [...new Set(friends.map(([category]) => category))]
  return (
    <div className="legacy-info-page">
      <header className="legacy-info-hero">
        <p className="legacy-kicker">LINKS</p>
        <h1>{l('友情链接')}</h1>
        <p>{l('汇聚技术资源、开源社区、竞赛团队及优质网站，方便学习、交流与探索更多创新内容。')}</p>
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

export function LogoInformationPage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const l = (value: string) => localize(value, context.locale)
  const cards = [
    ['T', '技术主轴', '向上的结构感，代表技术方向、持续成长和向上探索。'],
    ['C', '开放框架', '开放而有连接性的轮廓，象征协作与对外部世界的感知。'],
    ['H', '工程支撑', '稳定的支撑模块，代表硬件、系统架构与工程实现能力。'],
  ] as const
  return (
    <div className="legacy-info-page">
      <Link className="text-primary" href={withLocalePrefix('/more', context)}>
        ← {l('返回更多页面')}
      </Link>
      <section className="logo-rich-hero">
        <div className="logo-rich-image">
          {/* biome-ignore lint/performance/noImgElement: approved public CDN logo */}
          <img
            alt="Tung Chia-hui 个人 Logo"
            src="https://cdn.tungchiahui.cn/tungwebsite/assets/images/logo.png"
          />
          <strong>PERSONAL MARK · T / C / H</strong>
        </div>
        <div>
          <p className="legacy-kicker">TUNG CHIA-HUI</p>
          <h1>{l('个人 Logo')}</h1>
          <p>{l('一个把名字、机器人方向和工程气质压缩在一起的绿色几何符号。')}</p>
        </div>
      </section>
      <InfoSection
        title={l('字母结构')}
        description={l(
          '这个 Logo 以名字 Tung Chia-hui 的首字母 T / C / H 为核心，将三个字母融合进类似立方体的几何结构。中间向上的 T 是技术主轴；开放的 C 象征连接、协作与感知；稳定的 H 代表硬件、系统架构与工程实现。',
        )}
      >
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
      <InfoSection
        title={l('绿色含义')}
        description={l(
          '绿色强调成长、生命力与持续迭代。从一块开发板、一段驱动程序和一个节点，到一台能够自主运动的机器人，技术在一次次实践中逐渐生长。',
        )}
      />
      <InfoSection
        title={l('技术态度')}
        description={l(
          '这个 Logo 代表我对机器人系统的理解：既关注底层硬件，也重视上层软件；既追求工程实现，也保留创造力和探索欲。',
        )}
      />
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
  locale,
  title,
}: Readonly<{
  items: readonly (readonly [string, string, string, string])[]
  locale: AppLocale
  title: string
}>) {
  return (
    <InfoSection title={title}>
      <div className="grid gap-4">
        {items.map(([period, name, role, description]) => (
          <article className="legacy-timeline" key={`${period}-${name}`}>
            <time>{period}</time>
            <div>
              <h3>{localize(name, locale)}</h3>
              <strong>{localize(role, locale)}</strong>
              <p>{localize(description, locale)}</p>
            </div>
          </article>
        ))}
      </div>
    </InfoSection>
  )
}
