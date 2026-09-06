### 4.5.7 路径平滑节点说明

在Nav2框架中`nav2_smoother`功能包下的`smoother_server`节点通过加载和运行各种平滑器插件，对规划出的路径进行平滑处理，使得机器人能够更流畅、连续且安全地移动。这一功能对于提高机器人的导航性能和减少硬件磨损具有重要意义。

#### 1.订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /global\_costmap/costmap\_raw | nav2\_msgs/msg/Costmap | 全局代价地图的原始数据，用于路径规划 |
| /global\_costmap/published\_footprint | geometry\_msgs/msg/PolygonStamped | 机器人在全局代价地图中的足迹表示 |

#### 2.发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /plan\_smoothed | nav\_msgs/msg/Path | 经过平滑处理后的全局路径 |

#### 3.提供的Action服务器

| 话题 | 动作类型 | 描述 |
| :--- | :--- | :--- |
| /smooth\_path | nav2\_msgs/action/SmoothPath | 提供平滑路径的服务，接受路径平滑的请求，并返回平滑后的路径。这允许客户端（如行为树）异步地请求路径平滑，并在平滑完成后接收结果。 |

#### 4.参数

* `/bond_disable_heartbeat_timeout`: 指示是否禁用Bond的心跳超时功能。在分布式系统中，Bond用于管理节点间的连接和心跳，此参数用于调整心跳相关的行为。

* `costmap_topic`: 代价地图数据的ROS话题名称，通常是全局代价地图的原始数据。

* `footprint_topic`: 机器人足迹（即机器人在地图上的占用区域）的ROS话题名称，用于在全局代价地图中表示机器人的物理尺寸。

* `robot_base_frame`: 指定机器人基座的坐标系名称，这是机器人导航中用于定位和移动的参考点。

* `simple_smoother`:

  * `do_refinement`: 指示是否启用路径的细化（或进一步优化）过程。

  * `max_its`: 平滑过程中允许的最大迭代次数，用于控制平滑算法的收敛时间。

  * `plugin`: 平滑插件的类型，这里是`nav2_smoother::SimpleSmoother`，表示使用简单的平滑算法。

  * `tolerance`: 平滑算法的收敛容差，当路径变化小于此值时，认为平滑过程已完成。

  * `w_data`: 平滑过程中数据项（如障碍物距离）的权重。

  * `w_smooth`: 平滑过程中平滑项（如路径曲率）的权重。

* `smoother_plugins`: 定义的平滑插件列表，这里列出了`simple_smoother`，表示将使用此插件进行路径平滑。

* `transform_tolerance`: 坐标变换的容差，用于处理不同坐标系之间的转换时的不确定性。

* `use_sim_time`: 指定是否使用模拟时间而非实际时间。在仿真环境中，这通常设置为`true`，以匹配仿真器的虚拟时间；在真实环境中，应设置为`false`以使用ROS系统的实际时间。



