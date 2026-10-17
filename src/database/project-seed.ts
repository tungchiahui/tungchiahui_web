// Disposable local content only. Production projects come from the content repository.
export const developmentProjectFiles = [
  {
    path: 'content/projects/robot-navigation-fixture.md',
    contents: `---
title: Robot navigation fixture
date: '2024-07-01'
project:
  featured: true
  order: 10
  status: completed
  tags: [ROS2, NAV2, STM32]
  code: https://github.com/tungchiahui
---

A local case study for verifying project navigation, shared summaries and robot control documentation.

## 个人贡献

机器人导航、嵌入式控制与软件调试。这是本地测试数据。

## Implementation

The identifier \`ROS2_Control\` and code remain unchanged in every locale.

\`\`\`cpp
int main() { return 0; }
\`\`\`
`,
  },
  {
    path: 'content/projects/control-system-fixture.md',
    contents: `---
title: Embedded control fixture
date: '2023-07-01'
project:
  order: 20
  status: ongoing
  tags: [FreeRTOS, CAN, PID]
---

A second local case study verifies the complete project list and selection for the resume.

## Implementation

This fixture has no external links or cover image.
`,
  },
] as const
