// Legacy source: tungchiahui.github.io@43f249d5a18dab5f251b05383235f7bb438c3fcf.
// Stable IDs preserve the plan independently of progress records.
import type messages from '../../messages/zh-cn.json'

type MessageKey = keyof typeof messages.Roadmap
export type RoadmapSubtask = { id: string; title: MessageKey; acceptance: MessageKey }
export type RoadmapTask = {
  id: string
  track: 'robot' | 'motion' | 'research'
  title: MessageKey
  goal: MessageKey
  stack: readonly string[]
  subtasks: readonly RoadmapSubtask[]
}
export type RoadmapStage = {
  id: string
  stage: MessageKey
  date: string
  focus: MessageKey
  milestone: MessageKey
  allocation: readonly [number, number, number]
  tasks: readonly RoadmapTask[]
}
export const roadmap: {
  routeIntro: Record<
    'badge' | 'title' | 'summary' | 'mainTrack' | 'sideTrack' | 'researchTrack' | 'finalGoal',
    MessageKey
  >
  tracks: Record<
    'robot' | 'motion' | 'research',
    { label: MessageKey; title: MessageKey; color: string }
  >
  semesterPlans: readonly [RoadmapStage, ...RoadmapStage[]]
  milestoneList: readonly (readonly [MessageKey, MessageKey])[]
} = {
  milestoneList: [
    ['milestoneList_0_0', 'milestoneList_0_1'],
    ['milestoneList_1_0', 'milestoneList_1_1'],
    ['milestoneList_2_0', 'milestoneList_2_1'],
    ['milestoneList_3_0', 'milestoneList_3_1'],
    ['milestoneList_4_0', 'milestoneList_4_1'],
    ['milestoneList_5_0', 'milestoneList_5_1'],
    ['milestoneList_6_0', 'milestoneList_6_1'],
    ['milestoneList_7_0', 'milestoneList_7_1'],
    ['milestoneList_8_0', 'milestoneList_8_1'],
    ['milestoneList_9_0', 'milestoneList_9_1'],
    ['milestoneList_10_0', 'milestoneList_10_1'],
  ],
  routeIntro: {
    badge: 'routeIntro_badge',
    title: 'routeIntro_title',
    summary: 'routeIntro_summary',
    mainTrack: 'routeIntro_mainTrack',
    sideTrack: 'routeIntro_sideTrack',
    researchTrack: 'routeIntro_researchTrack',
    finalGoal: 'routeIntro_finalGoal',
  },
  semesterPlans: [
    {
      id: 'y1a',
      stage: 'semesterPlans_0_stage',
      date: '2026.09—2027.01',
      focus: 'semesterPlans_0_focus',
      milestone: 'semesterPlans_0_milestone',
      allocation: [70, 5, 25],
      tasks: [
        {
          id: 'cpp-linux',
          track: 'robot',
          title: 'semesterPlans_0_tasks_0_title',
          goal: 'semesterPlans_0_tasks_0_goal',
          stack: ['C++23', 'CMake', 'Linux', 'Git', 'GoogleTest', 'GDB'],
          subtasks: [
            {
              id: 'cpp',
              title: 'semesterPlans_0_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'concurrency',
              title: 'semesterPlans_0_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'cmake',
              title: 'semesterPlans_0_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'test',
              title: 'semesterPlans_0_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'debug',
              title: 'semesterPlans_0_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_0_tasks_0_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'stm32',
          track: 'robot',
          title: 'semesterPlans_0_tasks_1_title',
          goal: 'semesterPlans_0_tasks_1_goal',
          stack: ['STM32', 'FreeRTOS', 'PID', 'Encoder', 'UART', 'CAN'],
          subtasks: [
            {
              id: 'rtos',
              title: 'semesterPlans_0_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'encoder',
              title: 'semesterPlans_0_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'pid',
              title: 'semesterPlans_0_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'ramp',
              title: 'semesterPlans_0_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'safety',
              title: 'semesterPlans_0_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_0_tasks_1_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'protocol',
          track: 'robot',
          title: 'semesterPlans_0_tasks_2_title',
          goal: 'semesterPlans_0_tasks_2_goal',
          stack: ['C++23', 'CRC16', 'std::array', 'std::span'],
          subtasks: [
            {
              id: 'frame',
              title: 'semesterPlans_0_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'codec',
              title: 'semesterPlans_0_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'parser',
              title: 'semesterPlans_0_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'platform',
              title: 'semesterPlans_0_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'test-protocol',
              title: 'semesterPlans_0_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_0_tasks_2_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'driver',
          track: 'robot',
          title: 'semesterPlans_0_tasks_3_title',
          goal: 'semesterPlans_0_tasks_3_goal',
          stack: ['C++23', 'Boost.Asio', 'GoogleTest'],
          subtasks: [
            {
              id: 'transport',
              title: 'semesterPlans_0_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'reconnect',
              title: 'semesterPlans_0_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'state',
              title: 'semesterPlans_0_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'config',
              title: 'semesterPlans_0_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_3_subtasks_3_acceptance',
            },
            {
              id: 'driver-test',
              title: 'semesterPlans_0_tasks_3_subtasks_4_title',
              acceptance: 'semesterPlans_0_tasks_3_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'ros2-control',
          track: 'robot',
          title: 'semesterPlans_0_tasks_4_title',
          goal: 'semesterPlans_0_tasks_4_goal',
          stack: ['ROS 2', 'ros2_control', 'pluginlib', 'TF2'],
          subtasks: [
            {
              id: 'hardware',
              title: 'semesterPlans_0_tasks_4_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_4_subtasks_0_acceptance',
            },
            {
              id: 'interfaces',
              title: 'semesterPlans_0_tasks_4_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_4_subtasks_1_acceptance',
            },
            {
              id: 'controller',
              title: 'semesterPlans_0_tasks_4_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_4_subtasks_2_acceptance',
            },
            {
              id: 'params',
              title: 'semesterPlans_0_tasks_4_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_4_subtasks_3_acceptance',
            },
            {
              id: 'bringup',
              title: 'semesterPlans_0_tasks_4_subtasks_4_title',
              acceptance: 'semesterPlans_0_tasks_4_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'slam-theory-1',
          track: 'research',
          title: 'semesterPlans_0_tasks_5_title',
          goal: 'semesterPlans_0_tasks_5_goal',
          stack: ['Linear Algebra', 'Probability', 'SO(3)', 'SE(3)', 'EKF'],
          subtasks: [
            {
              id: 'linear',
              title: 'semesterPlans_0_tasks_5_subtasks_0_title',
              acceptance: 'semesterPlans_0_tasks_5_subtasks_0_acceptance',
            },
            {
              id: 'probability',
              title: 'semesterPlans_0_tasks_5_subtasks_1_title',
              acceptance: 'semesterPlans_0_tasks_5_subtasks_1_acceptance',
            },
            {
              id: 'lie',
              title: 'semesterPlans_0_tasks_5_subtasks_2_title',
              acceptance: 'semesterPlans_0_tasks_5_subtasks_2_acceptance',
            },
            {
              id: 'ekf-note',
              title: 'semesterPlans_0_tasks_5_subtasks_3_title',
              acceptance: 'semesterPlans_0_tasks_5_subtasks_3_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'winter1',
      stage: 'semesterPlans_1_stage',
      date: '2027.01—2027.02',
      focus: 'semesterPlans_1_focus',
      milestone: 'semesterPlans_1_milestone',
      allocation: [65, 20, 15],
      tasks: [
        {
          id: 'freeze-v05',
          track: 'robot',
          title: 'semesterPlans_1_tasks_0_title',
          goal: 'semesterPlans_1_tasks_0_goal',
          stack: ['GoogleTest', 'rosbag', 'Logging'],
          subtasks: [
            {
              id: 'packet',
              title: 'semesterPlans_1_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_1_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'disconnect',
              title: 'semesterPlans_1_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_1_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'timeout',
              title: 'semesterPlans_1_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_1_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'load',
              title: 'semesterPlans_1_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_1_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'review',
              title: 'semesterPlans_1_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_1_tasks_0_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'rtlinux',
          track: 'motion',
          title: 'semesterPlans_1_tasks_1_title',
          goal: 'semesterPlans_1_tasks_1_goal',
          stack: ['SCHED_FIFO', 'CPU Affinity', 'mlockall', 'PREEMPT_RT'],
          subtasks: [
            {
              id: 'normal',
              title: 'semesterPlans_1_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_1_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'fifo',
              title: 'semesterPlans_1_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_1_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'affinity',
              title: 'semesterPlans_1_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_1_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'memory',
              title: 'semesterPlans_1_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_1_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'jitter',
              title: 'semesterPlans_1_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_1_tasks_1_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'docs-v05',
          track: 'research',
          title: 'semesterPlans_1_tasks_2_title',
          goal: 'semesterPlans_1_tasks_2_goal',
          stack: ['Markdown', 'Architecture', 'Metrics'],
          subtasks: [
            {
              id: 'architecture',
              title: 'semesterPlans_1_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_1_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'metrics',
              title: 'semesterPlans_1_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_1_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'review-note',
              title: 'semesterPlans_1_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_1_tasks_2_subtasks_2_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'y1b',
      stage: 'semesterPlans_2_stage',
      date: '2027.02—2027.07',
      focus: 'semesterPlans_2_focus',
      milestone: 'semesterPlans_2_milestone',
      allocation: [75, 5, 20],
      tasks: [
        {
          id: 'calibration',
          track: 'robot',
          title: 'semesterPlans_2_tasks_0_title',
          goal: 'semesterPlans_2_tasks_0_goal',
          stack: ['TF2', 'IMU', 'LiDAR', 'Calibration'],
          subtasks: [
            {
              id: 'wheel',
              title: 'semesterPlans_2_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'imu',
              title: 'semesterPlans_2_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'time',
              title: 'semesterPlans_2_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'tree',
              title: 'semesterPlans_2_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'extrinsic',
              title: 'semesterPlans_2_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_4_acceptance',
            },
            {
              id: 'motion-test',
              title: 'semesterPlans_2_tasks_0_subtasks_5_title',
              acceptance: 'semesterPlans_2_tasks_0_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'ekf',
          track: 'research',
          title: 'semesterPlans_2_tasks_1_title',
          goal: 'semesterPlans_2_tasks_1_goal',
          stack: ['robot_localization', 'EKF', 'TF2'],
          subtasks: [
            {
              id: 'config',
              title: 'semesterPlans_2_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'state',
              title: 'semesterPlans_2_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'noise',
              title: 'semesterPlans_2_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'delay',
              title: 'semesterPlans_2_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_2_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'compare',
              title: 'semesterPlans_2_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_2_tasks_1_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'nav2',
          track: 'robot',
          title: 'semesterPlans_2_tasks_2_title',
          goal: 'semesterPlans_2_tasks_2_goal',
          stack: ['slam_toolbox', 'AMCL', 'Nav2', 'Behavior Tree'],
          subtasks: [
            {
              id: 'slam',
              title: 'semesterPlans_2_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'amcl',
              title: 'semesterPlans_2_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'single',
              title: 'semesterPlans_2_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'patrol',
              title: 'semesterPlans_2_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'dynamic',
              title: 'semesterPlans_2_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_4_acceptance',
            },
            {
              id: 'recovery',
              title: 'semesterPlans_2_tasks_2_subtasks_5_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_5_acceptance',
            },
            {
              id: 'metrics',
              title: 'semesterPlans_2_tasks_2_subtasks_6_title',
              acceptance: 'semesterPlans_2_tasks_2_subtasks_6_acceptance',
            },
          ],
        },
        {
          id: 'planning-lab',
          track: 'research',
          title: 'semesterPlans_2_tasks_3_title',
          goal: 'semesterPlans_2_tasks_3_goal',
          stack: ['A*', 'D* Lite', 'Hybrid A*', 'Nav2'],
          subtasks: [
            {
              id: 'astar',
              title: 'semesterPlans_2_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'dynamic-plan',
              title: 'semesterPlans_2_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'hybrid',
              title: 'semesterPlans_2_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'nav2-plugin',
              title: 'semesterPlans_2_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_2_tasks_3_subtasks_3_acceptance',
            },
            {
              id: 'compare-plan',
              title: 'semesterPlans_2_tasks_3_subtasks_4_title',
              acceptance: 'semesterPlans_2_tasks_3_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'arm-prep',
          track: 'robot',
          title: 'semesterPlans_2_tasks_4_title',
          goal: 'semesterPlans_2_tasks_4_goal',
          stack: ['URDF', 'Xacro', 'KDL', 'Eigen', 'MoveIt 2'],
          subtasks: [
            {
              id: 'urdf-arm',
              title: 'semesterPlans_2_tasks_4_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_0_acceptance',
            },
            {
              id: 'fk',
              title: 'semesterPlans_2_tasks_4_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_1_acceptance',
            },
            {
              id: 'ik',
              title: 'semesterPlans_2_tasks_4_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_2_acceptance',
            },
            {
              id: 'jacobian',
              title: 'semesterPlans_2_tasks_4_subtasks_3_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_3_acceptance',
            },
            {
              id: 'moveit-basic',
              title: 'semesterPlans_2_tasks_4_subtasks_4_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_4_acceptance',
            },
            {
              id: 'pose-goal',
              title: 'semesterPlans_2_tasks_4_subtasks_5_title',
              acceptance: 'semesterPlans_2_tasks_4_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'realtime-chassis',
          track: 'motion',
          title: 'semesterPlans_2_tasks_5_title',
          goal: 'semesterPlans_2_tasks_5_goal',
          stack: ['SCHED_FIFO', 'PREEMPT_RT', 'Threads'],
          subtasks: [
            {
              id: 'split',
              title: 'semesterPlans_2_tasks_5_subtasks_0_title',
              acceptance: 'semesterPlans_2_tasks_5_subtasks_0_acceptance',
            },
            {
              id: 'load',
              title: 'semesterPlans_2_tasks_5_subtasks_1_title',
              acceptance: 'semesterPlans_2_tasks_5_subtasks_1_acceptance',
            },
            {
              id: 'rt',
              title: 'semesterPlans_2_tasks_5_subtasks_2_title',
              acceptance: 'semesterPlans_2_tasks_5_subtasks_2_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'summer1',
      stage: 'semesterPlans_3_stage',
      date: '2027.07—2027.09',
      focus: 'semesterPlans_3_focus',
      milestone: 'semesterPlans_3_milestone',
      allocation: [70, 5, 25],
      tasks: [
        {
          id: 'engineering',
          track: 'robot',
          title: 'semesterPlans_3_tasks_0_title',
          goal: 'semesterPlans_3_tasks_0_goal',
          stack: ['Docker', 'CI', 'systemd', 'udev', 'rosbag'],
          subtasks: [
            {
              id: 'readme',
              title: 'semesterPlans_3_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'docker',
              title: 'semesterPlans_3_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'ci',
              title: 'semesterPlans_3_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'boot',
              title: 'semesterPlans_3_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'diagnostics',
              title: 'semesterPlans_3_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_4_acceptance',
            },
            {
              id: 'release',
              title: 'semesterPlans_3_tasks_0_subtasks_5_title',
              acceptance: 'semesterPlans_3_tasks_0_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'arm-moveit-sim',
          track: 'robot',
          title: 'semesterPlans_3_tasks_1_title',
          goal: 'semesterPlans_3_tasks_1_goal',
          stack: ['MoveIt 2', 'ros2_control', 'KDL', 'Gazebo / Isaac Sim'],
          subtasks: [
            {
              id: 'srdf',
              title: 'semesterPlans_3_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'controller',
              title: 'semesterPlans_3_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'planning-scene',
              title: 'semesterPlans_3_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'cpp-api',
              title: 'semesterPlans_3_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'pick-place',
              title: 'semesterPlans_3_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'error-arm',
              title: 'semesterPlans_3_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_5_acceptance',
            },
            {
              id: 'arm-metrics',
              title: 'semesterPlans_3_tasks_1_subtasks_6_title',
              acceptance: 'semesterPlans_3_tasks_1_subtasks_6_acceptance',
            },
          ],
        },
        {
          id: 'topic-survey',
          track: 'research',
          title: 'semesterPlans_3_tasks_2_title',
          goal: 'semesterPlans_3_tasks_2_goal',
          stack: ['SLAM', 'Mobile Manipulation', 'Fine Alignment', 'Sensor Fusion'],
          subtasks: [
            {
              id: 'review',
              title: 'semesterPlans_3_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_3_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'alignment-survey',
              title: 'semesterPlans_3_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_3_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'baseline',
              title: 'semesterPlans_3_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_3_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'metrics',
              title: 'semesterPlans_3_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_3_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'candidates',
              title: 'semesterPlans_3_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_3_tasks_2_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'ethercat-study',
          track: 'motion',
          title: 'semesterPlans_3_tasks_3_title',
          goal: 'semesterPlans_3_tasks_3_goal',
          stack: ['EtherCAT', 'CiA 402', 'PDO', 'SDO'],
          subtasks: [
            {
              id: 'pdo',
              title: 'semesterPlans_3_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_3_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'dc',
              title: 'semesterPlans_3_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_3_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'cia',
              title: 'semesterPlans_3_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_3_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'master',
              title: 'semesterPlans_3_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_3_tasks_3_subtasks_3_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'y2a',
      stage: 'semesterPlans_4_stage',
      date: '2027.09—2028.01',
      focus: 'semesterPlans_4_focus',
      milestone: 'semesterPlans_4_milestone',
      allocation: [55, 5, 40],
      tasks: [
        {
          id: 'arm-hardware',
          track: 'robot',
          title: 'semesterPlans_4_tasks_0_title',
          goal: 'semesterPlans_4_tasks_0_goal',
          stack: ['MoveIt 2', 'ros2_control', 'Robot Arm SDK', 'C++23'],
          subtasks: [
            {
              id: 'hardware-interface',
              title: 'semesterPlans_4_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'joint-state',
              title: 'semesterPlans_4_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'trajectory-exec',
              title: 'semesterPlans_4_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'planning-real',
              title: 'semesterPlans_4_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'pick-real',
              title: 'semesterPlans_4_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_4_acceptance',
            },
            {
              id: 'arm-success',
              title: 'semesterPlans_4_tasks_0_subtasks_5_title',
              acceptance: 'semesterPlans_4_tasks_0_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'rgbd',
          track: 'robot',
          title: 'semesterPlans_4_tasks_1_title',
          goal: 'semesterPlans_4_tasks_1_goal',
          stack: ['OpenCV', 'RGB-D', 'PCL', 'TF2', 'AprilTag', 'PnP'],
          subtasks: [
            {
              id: 'camera-model',
              title: 'semesterPlans_4_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'calibration',
              title: 'semesterPlans_4_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'pointcloud',
              title: 'semesterPlans_4_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'tag',
              title: 'semesterPlans_4_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'pnp',
              title: 'semesterPlans_4_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'vision-grasp',
              title: 'semesterPlans_4_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_4_tasks_1_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'fine-alignment',
          track: 'research',
          title: 'semesterPlans_4_tasks_2_title',
          goal: 'semesterPlans_4_tasks_2_goal',
          stack: ['Nav2', 'RGB-D', 'AprilTag', 'TF2'],
          subtasks: [
            {
              id: 'coarse',
              title: 'semesterPlans_4_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'relative-pose',
              title: 'semesterPlans_4_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'adjust',
              title: 'semesterPlans_4_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'threshold',
              title: 'semesterPlans_4_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'compare',
              title: 'semesterPlans_4_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_4_tasks_2_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'lio',
          track: 'robot',
          title: 'semesterPlans_4_tasks_3_title',
          goal: 'semesterPlans_4_tasks_3_goal',
          stack: ['Mid-360', 'FAST-LIO2', 'PCL'],
          subtasks: [
            {
              id: 'extrinsic-lio',
              title: 'semesterPlans_4_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'sync-lio',
              title: 'semesterPlans_4_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'mapping-lio',
              title: 'semesterPlans_4_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'localization',
              title: 'semesterPlans_4_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_3_subtasks_3_acceptance',
            },
            {
              id: 'resource',
              title: 'semesterPlans_4_tasks_3_subtasks_4_title',
              acceptance: 'semesterPlans_4_tasks_3_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'nav3d',
          track: 'robot',
          title: 'semesterPlans_4_tasks_4_title',
          goal: 'semesterPlans_4_tasks_4_goal',
          stack: ['FAST-LIO2', 'Nav2', 'PCL'],
          subtasks: [
            {
              id: 'filter',
              title: 'semesterPlans_4_tasks_4_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_4_subtasks_0_acceptance',
            },
            {
              id: 'ground',
              title: 'semesterPlans_4_tasks_4_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_4_subtasks_1_acceptance',
            },
            {
              id: 'costmap',
              title: 'semesterPlans_4_tasks_4_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_4_subtasks_2_acceptance',
            },
            {
              id: 'navigation',
              title: 'semesterPlans_4_tasks_4_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_4_subtasks_3_acceptance',
            },
          ],
        },
        {
          id: 'proposal',
          track: 'research',
          title: 'semesterPlans_4_tasks_5_title',
          goal: 'semesterPlans_4_tasks_5_goal',
          stack: ['Experiment', 'Baseline', 'Mobile Manipulation'],
          subtasks: [
            {
              id: 'candidate-a',
              title: 'semesterPlans_4_tasks_5_subtasks_0_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_0_acceptance',
            },
            {
              id: 'candidate-b',
              title: 'semesterPlans_4_tasks_5_subtasks_1_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_1_acceptance',
            },
            {
              id: 'candidate-c',
              title: 'semesterPlans_4_tasks_5_subtasks_2_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_2_acceptance',
            },
            {
              id: 'baseline-run',
              title: 'semesterPlans_4_tasks_5_subtasks_3_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_3_acceptance',
            },
            {
              id: 'problem',
              title: 'semesterPlans_4_tasks_5_subtasks_4_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_4_acceptance',
            },
            {
              id: 'proposal-doc',
              title: 'semesterPlans_4_tasks_5_subtasks_5_title',
              acceptance: 'semesterPlans_4_tasks_5_subtasks_5_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'winter2',
      stage: 'semesterPlans_5_stage',
      date: '2028.01—2028.02',
      focus: 'semesterPlans_5_focus',
      milestone: 'semesterPlans_5_milestone',
      allocation: [40, 10, 50],
      tasks: [
        {
          id: 'experiment-pipeline',
          track: 'research',
          title: 'semesterPlans_5_tasks_0_title',
          goal: 'semesterPlans_5_tasks_0_goal',
          stack: ['rosbag', 'Python', 'Metrics', 'Dataset'],
          subtasks: [
            {
              id: 'bags',
              title: 'semesterPlans_5_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_5_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'config-archive',
              title: 'semesterPlans_5_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_5_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'metrics-auto',
              title: 'semesterPlans_5_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_5_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'plots',
              title: 'semesterPlans_5_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_5_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'reproduce',
              title: 'semesterPlans_5_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_5_tasks_0_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'failure-taxonomy',
          track: 'robot',
          title: 'semesterPlans_5_tasks_1_title',
          goal: 'semesterPlans_5_tasks_1_goal',
          stack: ['Logging', 'Diagnostics', 'Behavior Tree'],
          subtasks: [
            {
              id: 'nav-failure',
              title: 'semesterPlans_5_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'align-failure',
              title: 'semesterPlans_5_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'manip-failure',
              title: 'semesterPlans_5_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'perception-failure',
              title: 'semesterPlans_5_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'hardware-failure',
              title: 'semesterPlans_5_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'failure-log',
              title: 'semesterPlans_5_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_5_tasks_1_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'motion-basic',
          track: 'motion',
          title: 'semesterPlans_5_tasks_2_title',
          goal: 'semesterPlans_5_tasks_2_goal',
          stack: ['EtherCAT', 'CiA 402', 'Trajectory'],
          subtasks: [
            {
              id: 'modes',
              title: 'semesterPlans_5_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_5_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'trajectory',
              title: 'semesterPlans_5_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_5_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'servo-demo',
              title: 'semesterPlans_5_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_5_tasks_2_subtasks_2_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'y2b',
      stage: 'semesterPlans_6_stage',
      date: '2028.02—2028.07',
      focus: 'semesterPlans_6_focus',
      milestone: 'semesterPlans_6_milestone',
      allocation: [45, 10, 45],
      tasks: [
        {
          id: 'mobile-manipulator',
          track: 'robot',
          title: 'semesterPlans_6_tasks_0_title',
          goal: 'semesterPlans_6_tasks_0_goal',
          stack: ['Nav2', 'MoveIt 2', 'RGB-D', 'ROS 2 Action'],
          subtasks: [
            {
              id: 'frames',
              title: 'semesterPlans_6_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'navigate-a',
              title: 'semesterPlans_6_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'align-a',
              title: 'semesterPlans_6_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'detect-pick',
              title: 'semesterPlans_6_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'transport',
              title: 'semesterPlans_6_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_4_acceptance',
            },
            {
              id: 'place',
              title: 'semesterPlans_6_tasks_0_subtasks_5_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_5_acceptance',
            },
            {
              id: 'demo',
              title: 'semesterPlans_6_tasks_0_subtasks_6_title',
              acceptance: 'semesterPlans_6_tasks_0_subtasks_6_acceptance',
            },
          ],
        },
        {
          id: 'behavior-tree',
          track: 'robot',
          title: 'semesterPlans_6_tasks_1_title',
          goal: 'semesterPlans_6_tasks_1_goal',
          stack: ['Behavior Tree', 'ROS 2 Action', 'Nav2', 'MoveIt 2'],
          subtasks: [
            {
              id: 'actions',
              title: 'semesterPlans_6_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'timeout',
              title: 'semesterPlans_6_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'retry',
              title: 'semesterPlans_6_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'fallback',
              title: 'semesterPlans_6_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'estop',
              title: 'semesterPlans_6_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'recovery-metrics',
              title: 'semesterPlans_6_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_6_tasks_1_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'system-metrics',
          track: 'robot',
          title: 'semesterPlans_6_tasks_2_title',
          goal: 'semesterPlans_6_tasks_2_goal',
          stack: ['Metrics', 'Failure Analysis', 'Regression Test'],
          subtasks: [
            {
              id: 'module-metrics',
              title: 'semesterPlans_6_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'e2e-metrics',
              title: 'semesterPlans_6_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'root-cause',
              title: 'semesterPlans_6_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'improve',
              title: 'semesterPlans_6_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'regression',
              title: 'semesterPlans_6_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_4_acceptance',
            },
            {
              id: 'target',
              title: 'semesterPlans_6_tasks_2_subtasks_5_title',
              acceptance: 'semesterPlans_6_tasks_2_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'paper',
          track: 'research',
          title: 'semesterPlans_6_tasks_3_title',
          goal: 'semesterPlans_6_tasks_3_goal',
          stack: ['Experiment', 'C++23', 'Python', 'Paper'],
          subtasks: [
            {
              id: 'method',
              title: 'semesterPlans_6_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'compare',
              title: 'semesterPlans_6_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'ablation',
              title: 'semesterPlans_6_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'writing',
              title: 'semesterPlans_6_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_3_acceptance',
            },
            {
              id: 'submit',
              title: 'semesterPlans_6_tasks_3_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_4_acceptance',
            },
            {
              id: 'system-value',
              title: 'semesterPlans_6_tasks_3_subtasks_5_title',
              acceptance: 'semesterPlans_6_tasks_3_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'pinocchio',
          track: 'robot',
          title: 'semesterPlans_6_tasks_4_title',
          goal: 'semesterPlans_6_tasks_4_goal',
          stack: ['Pinocchio', 'Eigen', 'URDF'],
          subtasks: [
            {
              id: 'model',
              title: 'semesterPlans_6_tasks_4_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_4_subtasks_0_acceptance',
            },
            {
              id: 'fk-pin',
              title: 'semesterPlans_6_tasks_4_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_4_subtasks_1_acceptance',
            },
            {
              id: 'rnea',
              title: 'semesterPlans_6_tasks_4_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_4_subtasks_2_acceptance',
            },
            {
              id: 'crba',
              title: 'semesterPlans_6_tasks_4_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_4_subtasks_3_acceptance',
            },
            {
              id: 'gravity',
              title: 'semesterPlans_6_tasks_4_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_4_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'motion-demo',
          track: 'motion',
          title: 'semesterPlans_6_tasks_5_title',
          goal: 'semesterPlans_6_tasks_5_goal',
          stack: ['EtherCAT', 'CiA 402', 'Servo'],
          subtasks: [
            {
              id: 'enable',
              title: 'semesterPlans_6_tasks_5_subtasks_0_title',
              acceptance: 'semesterPlans_6_tasks_5_subtasks_0_acceptance',
            },
            {
              id: 'home',
              title: 'semesterPlans_6_tasks_5_subtasks_1_title',
              acceptance: 'semesterPlans_6_tasks_5_subtasks_1_acceptance',
            },
            {
              id: 'mode',
              title: 'semesterPlans_6_tasks_5_subtasks_2_title',
              acceptance: 'semesterPlans_6_tasks_5_subtasks_2_acceptance',
            },
            {
              id: 'profile',
              title: 'semesterPlans_6_tasks_5_subtasks_3_title',
              acceptance: 'semesterPlans_6_tasks_5_subtasks_3_acceptance',
            },
            {
              id: 'optional-rule',
              title: 'semesterPlans_6_tasks_5_subtasks_4_title',
              acceptance: 'semesterPlans_6_tasks_5_subtasks_4_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'summer2',
      stage: 'semesterPlans_7_stage',
      date: '2028.07—2028.09',
      focus: 'semesterPlans_7_focus',
      milestone: 'semesterPlans_7_milestone',
      allocation: [80, 5, 15],
      tasks: [
        {
          id: 'stress-test',
          track: 'robot',
          title: 'semesterPlans_7_tasks_0_title',
          goal: 'semesterPlans_7_tasks_0_goal',
          stack: ['Metrics', 'Logging', 'Failure Analysis'],
          subtasks: [
            {
              id: 'missions',
              title: 'semesterPlans_7_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_7_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'records',
              title: 'semesterPlans_7_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_7_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'statistics',
              title: 'semesterPlans_7_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_7_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'main-failures',
              title: 'semesterPlans_7_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_7_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'freeze',
              title: 'semesterPlans_7_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_7_tasks_0_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'portfolio-ready',
          track: 'robot',
          title: 'semesterPlans_7_tasks_1_title',
          goal: 'semesterPlans_7_tasks_1_goal',
          stack: ['GitHub', 'Video', 'Docs', 'Portfolio'],
          subtasks: [
            {
              id: 'main-video',
              title: 'semesterPlans_7_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'amr-video',
              title: 'semesterPlans_7_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'arm-video',
              title: 'semesterPlans_7_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'recovery-video',
              title: 'semesterPlans_7_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'website',
              title: 'semesterPlans_7_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'resume',
              title: 'semesterPlans_7_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_7_tasks_1_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'embodied-extension',
          track: 'robot',
          title: 'semesterPlans_7_tasks_2_title',
          goal: 'semesterPlans_7_tasks_2_goal',
          stack: ['VLM', 'VLA', 'ROS 2', 'Task Planning'],
          subtasks: [
            {
              id: 'language',
              title: 'semesterPlans_7_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_7_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'perception',
              title: 'semesterPlans_7_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_7_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'dispatch',
              title: 'semesterPlans_7_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_7_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'guard',
              title: 'semesterPlans_7_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_7_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'scope',
              title: 'semesterPlans_7_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_7_tasks_2_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'paper-freeze',
          track: 'research',
          title: 'semesterPlans_7_tasks_3_title',
          goal: 'semesterPlans_7_tasks_3_goal',
          stack: ['Thesis', 'Archive'],
          subtasks: [
            {
              id: 'result-freeze',
              title: 'semesterPlans_7_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_7_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'thesis-outline',
              title: 'semesterPlans_7_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_7_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'code-archive',
              title: 'semesterPlans_7_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_7_tasks_3_subtasks_2_acceptance',
            },
          ],
        },
        {
          id: 'motion-review',
          track: 'motion',
          title: 'semesterPlans_7_tasks_4_title',
          goal: 'semesterPlans_7_tasks_4_goal',
          stack: ['Real-time Linux', 'EtherCAT', 'CiA 402'],
          subtasks: [
            {
              id: 'summary',
              title: 'semesterPlans_7_tasks_4_subtasks_0_title',
              acceptance: 'semesterPlans_7_tasks_4_subtasks_0_acceptance',
            },
            {
              id: 'interview-note',
              title: 'semesterPlans_7_tasks_4_subtasks_1_title',
              acceptance: 'semesterPlans_7_tasks_4_subtasks_1_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'y3a',
      stage: 'semesterPlans_8_stage',
      date: '2028.09—2029.01',
      focus: 'semesterPlans_8_focus',
      milestone: 'semesterPlans_8_milestone',
      allocation: [45, 10, 45],
      tasks: [
        {
          id: 'job-search',
          track: 'robot',
          title: 'semesterPlans_8_tasks_0_title',
          goal: 'semesterPlans_8_tasks_0_goal',
          stack: ['Resume', 'Interview', 'Portfolio'],
          subtasks: [
            {
              id: 'target',
              title: 'semesterPlans_8_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_8_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'main-resume',
              title: 'semesterPlans_8_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_8_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'motion-resume',
              title: 'semesterPlans_8_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_8_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'review-job',
              title: 'semesterPlans_8_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_8_tasks_0_subtasks_3_acceptance',
            },
            {
              id: 'offer-compare',
              title: 'semesterPlans_8_tasks_0_subtasks_4_title',
              acceptance: 'semesterPlans_8_tasks_0_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'interview-system',
          track: 'robot',
          title: 'semesterPlans_8_tasks_1_title',
          goal: 'semesterPlans_8_tasks_1_goal',
          stack: ['C++23', 'Linux', 'ROS 2', 'Robotics'],
          subtasks: [
            {
              id: 'cpp-interview',
              title: 'semesterPlans_8_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_8_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'linux-interview',
              title: 'semesterPlans_8_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_8_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'ros2-interview',
              title: 'semesterPlans_8_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_8_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'robotics-interview',
              title: 'semesterPlans_8_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_8_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'design-interview',
              title: 'semesterPlans_8_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_8_tasks_1_subtasks_4_acceptance',
            },
          ],
        },
        {
          id: 'thesis70',
          track: 'research',
          title: 'semesterPlans_8_tasks_2_title',
          goal: 'semesterPlans_8_tasks_2_goal',
          stack: ['Thesis', 'Paper'],
          subtasks: [
            {
              id: 'intro',
              title: 'semesterPlans_8_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'system',
              title: 'semesterPlans_8_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'method-chapter',
              title: 'semesterPlans_8_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_2_acceptance',
            },
            {
              id: 'experiment-chapter',
              title: 'semesterPlans_8_tasks_2_subtasks_3_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_3_acceptance',
            },
            {
              id: 'figures',
              title: 'semesterPlans_8_tasks_2_subtasks_4_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_4_acceptance',
            },
            {
              id: 'advisor',
              title: 'semesterPlans_8_tasks_2_subtasks_5_title',
              acceptance: 'semesterPlans_8_tasks_2_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'maintenance',
          track: 'motion',
          title: 'semesterPlans_8_tasks_3_title',
          goal: 'semesterPlans_8_tasks_3_goal',
          stack: ['Archive', 'Demo', 'Backup'],
          subtasks: [
            {
              id: 'bugfix',
              title: 'semesterPlans_8_tasks_3_subtasks_0_title',
              acceptance: 'semesterPlans_8_tasks_3_subtasks_0_acceptance',
            },
            {
              id: 'backup',
              title: 'semesterPlans_8_tasks_3_subtasks_1_title',
              acceptance: 'semesterPlans_8_tasks_3_subtasks_1_acceptance',
            },
            {
              id: 'dependency',
              title: 'semesterPlans_8_tasks_3_subtasks_2_title',
              acceptance: 'semesterPlans_8_tasks_3_subtasks_2_acceptance',
            },
            {
              id: 'handover',
              title: 'semesterPlans_8_tasks_3_subtasks_3_title',
              acceptance: 'semesterPlans_8_tasks_3_subtasks_3_acceptance',
            },
          ],
        },
      ],
    },
    {
      id: 'y3b',
      stage: 'semesterPlans_9_stage',
      date: '2029.02—2029.06',
      focus: 'semesterPlans_9_focus',
      milestone: 'semesterPlans_9_milestone',
      allocation: [10, 5, 85],
      tasks: [
        {
          id: 'graduation',
          track: 'research',
          title: 'semesterPlans_9_tasks_0_title',
          goal: 'semesterPlans_9_tasks_0_goal',
          stack: ['Thesis', 'Defense'],
          subtasks: [
            {
              id: 'draft',
              title: 'semesterPlans_9_tasks_0_subtasks_0_title',
              acceptance: 'semesterPlans_9_tasks_0_subtasks_0_acceptance',
            },
            {
              id: 'review',
              title: 'semesterPlans_9_tasks_0_subtasks_1_title',
              acceptance: 'semesterPlans_9_tasks_0_subtasks_1_acceptance',
            },
            {
              id: 'defense',
              title: 'semesterPlans_9_tasks_0_subtasks_2_title',
              acceptance: 'semesterPlans_9_tasks_0_subtasks_2_acceptance',
            },
            {
              id: 'final-paper',
              title: 'semesterPlans_9_tasks_0_subtasks_3_title',
              acceptance: 'semesterPlans_9_tasks_0_subtasks_3_acceptance',
            },
          ],
        },
        {
          id: 'final-archive',
          track: 'robot',
          title: 'semesterPlans_9_tasks_1_title',
          goal: 'semesterPlans_9_tasks_1_goal',
          stack: ['GitHub', 'Docker', 'Archive'],
          subtasks: [
            {
              id: 'amr-final',
              title: 'semesterPlans_9_tasks_1_subtasks_0_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_0_acceptance',
            },
            {
              id: 'arm-final',
              title: 'semesterPlans_9_tasks_1_subtasks_1_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_1_acceptance',
            },
            {
              id: 'mobile-final',
              title: 'semesterPlans_9_tasks_1_subtasks_2_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_2_acceptance',
            },
            {
              id: 'data-final',
              title: 'semesterPlans_9_tasks_1_subtasks_3_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_3_acceptance',
            },
            {
              id: 'release-final',
              title: 'semesterPlans_9_tasks_1_subtasks_4_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_4_acceptance',
            },
            {
              id: 'handover-final',
              title: 'semesterPlans_9_tasks_1_subtasks_5_title',
              acceptance: 'semesterPlans_9_tasks_1_subtasks_5_acceptance',
            },
          ],
        },
        {
          id: 'career-review',
          track: 'motion',
          title: 'semesterPlans_9_tasks_2_title',
          goal: 'semesterPlans_9_tasks_2_goal',
          stack: ['Review', 'Career'],
          subtasks: [
            {
              id: 'strength',
              title: 'semesterPlans_9_tasks_2_subtasks_0_title',
              acceptance: 'semesterPlans_9_tasks_2_subtasks_0_acceptance',
            },
            {
              id: 'research-review',
              title: 'semesterPlans_9_tasks_2_subtasks_1_title',
              acceptance: 'semesterPlans_9_tasks_2_subtasks_1_acceptance',
            },
            {
              id: 'next',
              title: 'semesterPlans_9_tasks_2_subtasks_2_title',
              acceptance: 'semesterPlans_9_tasks_2_subtasks_2_acceptance',
            },
          ],
        },
      ],
    },
  ],
  tracks: {
    robot: {
      label: 'tracks_robot_label',
      title: 'tracks_robot_title',
      color: '#0f9f7a',
    },
    motion: {
      label: 'tracks_motion_label',
      title: 'tracks_motion_title',
      color: '#2563eb',
    },
    research: {
      label: 'tracks_research_label',
      title: 'tracks_research_title',
      color: '#b7791f',
    },
  },
} as const
export const techRecordKeys = roadmap.semesterPlans.flatMap((stage) =>
  stage.tasks.flatMap((task) =>
    task.subtasks.map((subtask) => `${stage.id}/${task.id}/${subtask.id}`),
  ),
)
export const techRecordKeySet: ReadonlySet<string> = new Set(techRecordKeys)
