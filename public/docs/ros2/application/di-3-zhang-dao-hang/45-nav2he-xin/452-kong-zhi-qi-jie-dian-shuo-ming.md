### 4.5.3 规划器节点说明

在Nav2 导航框架中`nav2_planner`功能包下的`planner_server`节点，负责处理路径规划请求，生成从当前位置到目标位置的路径。该节点在执行时需要依赖于`/global_costmap/global_costmap`节点提供的地图消息。

#### 1. planner\_server发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /plan | nav\_msgs/msg/Path | 当前位置到目标点的全局路径 |

#### 2.planner\_server 参数

* `/bond_disable_heartbeat_timeout`: 这个参数控制是否禁用心跳超时检测，在ROS 2中，节点之间的通信绑定（bonding）机制用于增强通信的可靠性。心跳超时是检测节点是否仍然活跃的一种机制。如果该参数设置为`true`，则表示禁用了心跳超时检测，这可能在某些特定的网络环境下或当确信节点间通信非常稳定时使用。

* `GridBased`: 这是一个配置块，专门用于设置基于网格的规划器的参数。基于网格的规划器通常使用地图的网格化表示来规划路径。

  * `allow_unknown`: 控制规划器是否允许在地图的未知（即未探索）区域中规划路径。
  * `plugin`: 指定使用的规划器插件。
  * `tolerance`: 设置规划路径时的容忍度，通常用于考虑机器人尺寸和定位的不确定性。
  * `use_astar`: 控制是否使用A\* 算法进行路径规划_。A\* _算法是一种启发式搜索算法，能够找到从起点到终点的最短路径。

  * `use_final_approach_orientation`: 控制规划器是否在路径的终点附近考虑机器人的最终朝向。

* `expected_planner_frequency`: 这个参数表示对规划器生成新路径的频率的预期值。它帮助系统监控规划器的性能，并可能用于调试或性能优化。

* `planner_plugins`: 这是一个列表，指定了可用的规划器插件。在这个例子中，它只包含了一个`GridBased`规划器，但理论上可以包含多个不同类型的规划器，以适应不同的导航需求。

* `use_sim_time`: 这个参数控制是否使用模拟时间。在仿真环境中，时间是由仿真软件控制的，而不是由实际的物理时钟控制的。将此参数设置为`true`允许节点在仿真环境中正常运行，而无需依赖实际的系统时间。这对于开发和测试导航算法非常有用。

#### 3. /global\_costmap/global\_costmap订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /global\_costmap/footprint | geometry\_msgs/msg/Polygon | 机器人（或任何移动平台）的足迹（footprint）信息。足迹是机器人在地图上占据的空间形状，通常用多边形表示。 |
| /map | nav\_msgs/msg/OccupancyGrid | 发布环境地图，特别是用于导航的占用网格图（Occupancy Grid Map）。 |
| /scan | sensor\_msgs/msg/LaserScan | 激光扫描数据。 |

#### 4. /global\_costmap/global\_costmap发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /global\_costmap/costmap | nav\_msgs/msg/OccupancyGrid | 发布全局代价地图的当前状态。 |
| /global\_costmap/costmap\_raw | nav2\_msgs/msg/Costmap | 未经进一步处理的原始代价地图数据。 |
| /global\_costmap/costmap\_updates | map\_msgs/msg/OccupancyGridUpdate | 全局代价地图的更新，该消息可以高效更新地图。 |
| /global\_costmap/published\_footprint | geometry\_msgs/msg/PolygonStamped | 发布机器人的足迹（footprint），即机器人在地图上占据的空间形状。 |

#### 5./global\_costmap/global\_costmap参数

* `/bond_disable_heartbeat_timeout`: 控制是否禁用心跳超时检测，这在节点间通信绑定时用于监控对方节点的活跃度。

* `always_send_full_costmap`: 控制是否总是发送完整的代价地图信息，而不是仅发送变化的部分。

* `clearable_layers`: 列出可以被清除的代价图层，这些图层中的障碍物信息可以通过某种方式（如传感器数据）被更新或清除。

* `filters`: 定义应用于代价地图的过滤器列表，用于预处理或修改地图数据。

* `footprint`: 指定机器人在地图上的足迹形状，即机器人占据的空间范围。

* `footprint_padding`: 为机器人的足迹添加额外的填充空间，以考虑机器人运动时的额外空间需求。

* `global_frame`: 定义全局代价地图所使用的参考坐标系。

* `height`和`width`: 定义全局代价地图的高度和宽度（以单元格数计）。

* `inflation_layer`: 配置膨胀层的参数，膨胀层用于在障碍物周围增加一定宽度的“缓冲区”，以避免机器人与障碍物过近。

  * `cost_scaling_factor`: 膨胀成本的缩放因子。
  * `enabled`: 控制膨胀层是否启用。
  * `inflate_around_unknown`: 控制是否在未知空间周围进行膨胀。
  * `inflate_unknown`: 控制是否将未知空间视为障碍物并进行膨胀。
  * `inflation_radius`: 膨胀的半径。
  * `plugin`: 指定使用的膨胀层插件。

* `lethal_cost_threshold`: 定义代价地图中视为“致命”障碍物的成本阈值。

* `map_topic`: 指定订阅以获取地图信息的ROS话题。

* `observation_sources`: 定义代价地图的观测源，即哪些传感器或数据源用于更新地图。

* `obstacle_layer`: 配置障碍物层的参数，障碍物层负责处理传感器观测到的障碍物信息。

  * `combination_method`: 定义如何组合多个观测源的信息。
  * `enabled`: 控制障碍物层是否启用。
  * `footprint_clearing_enabled`: 控制是否清除机器人足迹内的障碍物信息。
  * `max_obstacle_height`和`min_obstacle_height`: 定义障碍物的高度范围。
  * `observation_sources`: 指定障碍物信息的来源。
  * `plugin`: 指定使用的障碍物层插件。
  * `scan`: 包含与激光扫描相关的配置，如扫描数据的处理方式。

* `origin_x`和`origin_y`: 定义全局代价地图原点的坐标。

* `plugins`: 列出启用的代价地图插件，这些插件定义了如何构建和更新代价地图。

* `publish_frequency`: 定义发布代价地图的频率。

* `resolution`: 定义代价地图的分辨率，即每个单元格代表的实际物理尺寸。

* `robot_base_frame`: 定义机器人基座的参考坐标系。

* `robot_radius`: 定义机器人的半径，用于计算机器人在地图上的占用空间。

* `rolling_window`: 控制是否使用滚动窗口（即动态变化的地图区域）而非固定大小的地图。

* `static_layer`: 配置静态层的参数，静态层负责处理地图中的静态障碍物信息。

  * `enabled`: 控制静态层是否启用。
  * `map_subscribe_transient_local`: 控制是否订阅瞬态本地地图更新。
  * `map_topic`: 指定静态地图的ROS话题（如果不同于全局地图）。
  * `plugin`: 指定使用的静态层插件。
  * `subscribe_to_updates`: 控制是否订阅地图更新。
  * `transform_tolerance`: 定义坐标变换的容忍度。

* `track_unknown_space`: 控制是否跟踪地图中的未知空间。

* `transform_tolerance`: 定义在坐标变换过程中允许的误差范围。

* `trinary_costmap`: 控制是否使用三态代价地图（空闲、占用、未知），而不是仅使用二态（空闲、占用）。

* `unknown_cost_value`: 定义在代价地图中表示未知空间的值。

* `update_frequency`: 定义更新代价地图的频率。

* `use_maximum`: 控制是否使用多个观测源中的最大值来更新代价地图。

* `use_sim_time`: 控制是否使用仿真时间（在仿真环境中很有用）。

* `voxel_layer`: 配置体素层的参数，体素层使用体素网格来表示三维空间中的障碍物信息。

  * `enabled`: 控制体素层是否启用。
  * `footprint_clearing_enabled`: 控制是否清除机器人足迹内的体素信息。
  * `mark_threshold`和`unknown_threshold`: 定义将体素视为障碍物或未知的阈值。
  * `max_obstacle_height`和`min_obstacle_height`: 定义体素表示的障碍物的高度范围。
  * `observation_sources`: 指定体素信息的来源。
  * `origin_z`: 定义体素网格在Z轴上的原点。
  * `plugin`: 指定使用的体素层插件。
  * `publish_voxel_map`: 控制是否发布体素地图。
  * `scan`: 包含与激光扫描相关的配置，如扫描数据的处理方式。
  * `z_resolution`和`z_voxels`: 定义体素网格在Z轴上的分辨率和体素数。



