### 4.4.1 定位节点说明

功能包`nav2_amcl`中的核心节点为amcl。该节点相关信息如下。

#### 1.订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /map | /nav\_msgs/msg/OccupancyGrid | 地图数据 |
| /scan | /sensor\_msgs/msg/LaserScan | 激光雷达数据 |
| /initialpose | /geometry\_msgs/msg/PoseWithCovarianceStamped | 用来初始化粒子滤波器的均值和协方差 |
| /tf | /tf2\_msgs/msg/TFMessage | 坐标变换消息 |

#### 2.发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /amcl\_pose | /geometry\_msgs/msg/PoseWithCovarianceStamped | 机器人在地图中的位姿估计 |
| /particle\_cloud | /nav2\_msgs/msg/ParticleCloud | 位姿估计集合，rviz中可以被 PoseArray 订阅然后图形化显示机器人的位姿估计集合 |
| /tf | /tf2\_msgs/msg/TFMessage | 发布从 odom 与 map 的转换 |

#### 3.发布的服务

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /reinitialize\_global\_localization | std\_srvs/srv/Empty | 在全局范围内初始化粒子位姿 |
| /request\_nomotion\_update | std\_srvs/srv/Empty | 在没有运动模型更新的情况下手动触发粒子群的更新 |

#### 4.参数

##### 通用参数

* `bond_disable_heartbeat_timeout`: 设置为`true`时，禁用amcl节点与其他节点之间基于心跳的超时检测。这通常用于当节点之间的连接非常稳定，不需要频繁的心跳检测来确认连接状态时。

* `base_frame_id`: 定义机器人基坐标系的ID，通常是`base_link`或类似的名称。

* `global_frame_id`: 定义全局地图坐标系的ID，通常是`map`。

* `odom_frame_id`: 定义里程计坐标系的ID，通常是`odom`。

* `tf_broadcast`: 设置为`true`时，amcl节点会发布从里程计坐标系到全局地图坐标系的变换。

* `transform_tolerance`: 设置TF变换的容忍度，用于处理TF树中的时间不一致性。

* `use_sim_time`: 设置为`true`时，amcl将使用ROS 2的模拟时间（如果可用）。这在仿真环境中很有用。

##### 激光模型参数

* `laser_model_type`: 设置激光模型类型，`likelihood_field`是一种常用的模型，它考虑了激光束击中障碍物的概率。

* `laser_max_range`和`laser_min_range`: 分别设置激光雷达的最大和最小探测范围。

* `laser_likelihood_max_dist`: 设置激光模型考虑的最大距离，超过这个距离的数据将被忽略。

* `do_beamskip`和相关参数（`beam_skip_distance`、`beam_skip_threshold`、`beam_skip_error_threshold`）: 这些参数用于控制是否跳过某些激光束的处理，以减少计算量。然而，`do_beamskip`被设置为`false`，意味着不跳过任何激光束。

##### 粒子滤波器参数

* `alpha1`**到**`alpha5`: 这些参数用于控制粒子滤波器中的权重更新过程，但它们的具体作用可能因amcl的实现而异。在标准的amcl实现中，这些参数可能不是直接使用的。

* `max_particles`和`min_particles`: 分别设置粒子滤波器的最大和最小粒子数。

* `resample_interval`: 设置在重采样前需要的滤波更新次数。

* `pf_err`和`pf_z`: 这些参数用于控制粒子滤波器的性能，但它们的具体作用可能依赖于amcl的实现细节。

##### 初始位姿参数

* `initial_pose`: 定义了机器人的初始位姿（x, y, yaw, z），但在实际使用中，如果`set_initial_pose`被设置为`true`，则这个初始位姿可能会被通过服务请求设置的初始位姿所覆盖。

* `set_initial_pose`: 设置为`true`时，允许通过服务请求来设置机器人的初始位姿。

* `always_reset_initial_pose`: 设置为`false`时，表示不会在每个定位会话开始时自动重置初始位姿。

##### 其他参数

* `first_map_only`: 当设置为`false`时，表示amcl将订阅并处理不断更新的地图话题。

* `map_topic`: 定义地图话题的名称，amcl将订阅这个话题以获取地图信息。

* `scan_topic`: 定义激光雷达扫描数据话题的名称，amcl将订阅这个话题以获取用于定位的数据。

* `save_pose_rate`: 设置保存机器人位姿的速率（以Hz为单位）。

* `recovery_alpha_fast`和`recovery_alpha_slow`: 这些参数在标准的amcl实现中可能不是直接使用的，它们可能属于某个特定版本的amcl或扩展。

* `z_hit`、`z_rand`、`z_short`、`z_max`和`sigma_hit`: 这些参数定义了激光模型中的概率分布，用于计算激光束击中障碍物或随机位置的概率。



