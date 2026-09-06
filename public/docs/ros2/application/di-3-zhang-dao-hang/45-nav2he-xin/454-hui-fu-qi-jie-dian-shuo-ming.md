### 4.5.5 恢复器节点说明

恢复行为是机器人导航过程中一个至关重要的部分，它允许机器人在遇到障碍、卡住或其他导航问题时采取一系列预定义的动作来尝试恢复。在Nav2中由`nav2_behaviors`功能包的`behavior_server`实现这一功能。

#### 1.订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /clock | rosgraph\_msgs/msg/Clock | ROS系统时间 |
| /cmd\_vel\_teleop | geometry\_msgs/msg/Twist | 遥操作命令，用于控制机器人的线性和角速度 |
| /local\_costmap/costmap\_raw | nav2\_msgs/msg/Costmap | 局部代价地图的原始数据 |
| /local\_costmap/published\_footprint | geometry\_msgs/msg/PolygonStamped | 机器人在局部代价地图中的已发布足迹 |
| /preempt\_teleop | std\_msgs/msg/Empty | 遥操作抢占信号，用于中断当前遥操作 |

#### 2.发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /cmd\_vel | geometry\_msgs/msg/Twist | 发送给底层控制器的速度命令 |

#### 3.提供的Action服务器

| 话题 | Action接口 | 描述 |
| :--- | :--- | :--- |
| /assisted\_teleop | nav2\_msgs/action/AssistedTeleop | 遥控辅助操作服务，允许用户在导航时提供方向性输入 |
| /backup | nav2\_msgs/action/BackUp | 后退动作服务，用于在特定情况下使机器人后退 |
| /drive\_on\_heading | nav2\_msgs/action/DriveOnHeading | 按指定航向行驶的动作服务 |
| /spin | nav2\_msgs/action/Spin | 旋转动作服务，允许机器人在原地旋转 |
| /wait | nav2\_msgs/action/Wait | 等待动作服务，使机器人在当前位置等待一定时间 |

#### 4.参数

#### 参数

* `use_sim_time`: 该参数指定是否使用模拟时间而非实际时间。这在仿真环境中非常有用，因为仿真环境可以加速或减速时间流逝，而不需要等待实际时间的流逝。

* `global_frame`: 定义全局坐标系的名称，该坐标系通常用于导航任务中的定位和路径规划。在这里，它被设置为`odom`，意味着使用里程计数据来作为全局坐标系的参考。

* `robot_base_frame`: 指定机器人基座的坐标系名称。这是机器人上用于定位和运动控制的参考点，通常与机器人的物理中心或驱动轮的中心相对应。

* `odom_topic`: 这是一个ROS话题名称，用于发布里程计数据。里程计数据包含了机器人随时间推移的位置和姿态变化信息，是导航和定位系统的关键输入之一。

* `/bond_disable_heartbeat_timeout`：这个参数可能用于配置ROS节点之间的心跳检测机制。将其设置为`true`可能意味着禁用或调整心跳超时的行为，以便在特定情况下（如仿真环境）避免不必要的超时错误。

* `assisted_teleop`,`backup`,`drive_on_heading`,`spin`,`wait`: 这些是行为树中可能使用的行为插件的配置项。每个插件都定义了机器人可以执行的一种特定行为，如辅助遥操作、后退、按指定方向行驶、原地旋转和等待。

* `behavior_plugins`: 列出了在行为树中可用的行为插件名称。

* `cmd_vel_teleop`: 指定了用于遥操作的速度控制命令的ROS话题名称。

* `costmap_topic`: 定义了局部代价地图的ROS话题名称，代价地图用于表示环境中的障碍物和可通行区域。

* `cycle_frequency`: 定义了导航系统更新其状态和规划新路径的频率（以赫兹为单位）。

* `max_rotational_vel`,`min_rotational_vel`,`rotational_acc_lim`: 这些参数定义了机器人旋转时的最大速度、最小速度和加速度限制。

* `projection_time`: 与代价地图的更新或预测未来障碍物位置有关的时间参数。

* `footprint_topic`: 定义了发布机器人足迹（即机器人占据的空间）的ROS话题名称。

* `simulate_ahead_time`,`simulation_time_step`: 这些参数与仿真环境相关，可能用于控制仿真过程中的时间流逝和步长。

* `transform_tolerance`: 定义了坐标变换时的容差范围，用于处理不同坐标系之间的微小差异。



