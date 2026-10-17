// Shared structure and contact identities; translated prose stays in Web.information.
export const cvProfile = {
  email: 'tungchiahui@gmail.com',
  github: 'https://github.com/tungchiahui',
  githubName: 'tungchiahui',
  qq: '2225279276',
  wechat: 'tungchiahui',
  portrait: 'https://cdn.tungchiahui.cn/tungwebsite/assets/images/tungchiahui.webp',
} as const

export const education = [
  [
    'educationUndergraduatePeriod',
    'educationUndergraduateName',
    'educationUndergraduateRole',
    'educationUndergraduateBody',
  ],
  ['educationMasterPeriod', 'educationMasterName', 'educationMasterRole', 'educationMasterBody'],
] as const

export const experiences = [
  [
    'experienceRoboconPeriod',
    'experienceRoboconName',
    'experienceRoboconRole',
    'experienceRoboconBody',
  ],
  ['experienceAmrPeriod', 'experienceAmrName', 'experienceAmrRole', 'experienceAmrBody'],
  ['experienceTeamPeriod', 'experienceTeamName', 'experienceTeamRole', 'experienceTeamBody'],
] as const

export const awards = [
  'awardRoboconIndividualSecond',
  'awardRoboconTeamSecond',
  'awardRoboconTeamThird',
  'awardRoboconIndividualThird',
  'awardEnergy',
  'awardSkills',
] as const
