### 4.5.4 控制器节点说明

在Nav2导航系统中`nav2_controller`功能包的`controller_server`负责处理导航任务中的控制请求，确保机器人能够按照规划的路径进行移动。其主要功能是根据`nav2_planner`模块计算出的全局或局部路径，生成速度、方向控制的命令，即控制机器人沿着规划好的路径行走。该节点在执行时还需要依赖于`/local_costmap/local_costmap`节点提供的地图消息。

#### 1.controller\_server订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /odom | nav\_msgs/msg/Odometry | 机器人的里程计信息，包含位置、速度和姿态 |
| /speed\_limit | nav2\_msgs/msg/SpeedLimit | 导航过程中的速度限制信息，用于动态调整机器人的移动速度 |

#### 2.controller\_server发布的话题

| 话题名称 | 消息类型 | 描述 |
| :--- | :--- | :--- |
| /cmd\_vel\_nav | geometry\_msgs/msg/Twist | 发布控制命令，包括线性和角速度，用于控制机器人按照规划路径移动。 |
| /cost\_cloud | sensor\_msgs/msg/PointCloud2 | 发布成本地图中的点云数据，用于避障和路径规划。 |
| /local\_plan | nav\_msgs/msg/Path | 发布局部路径规划结果，即机器人应如何到达当前目标点附近的一个点。 |
| /marker | visualization\_msgs/msg/MarkerArray | 发布可视化标记，用于在RViz等可视化工具中显示路径、障碍物等信息。 |
| /received\_global\_plan | nav\_msgs/msg/Path | 发布从全局规划器接收到的全局路径，即当前位置到目标点的路径。 |
| /transformed\_global\_plan | nav\_msgs/msg/Path | 发布经过坐标变换的全局路径，确保路径与机器人的当前坐标系一致。 |

#### 3.controller\_server参数

* FollowPath: 这个部分定义了一个名为FollowPath的插件或配置集，它可能是一个路径跟随行为或算法的配置。它包含了多个子参数和子配置，用于定义如何跟随路径。

* * BaseObstacle: 定义了基本的障碍物评估参数，用于在路径跟随过程中避免障碍物。

    * class: 指定了类的名称，这里是BaseObstacle，表示这是一个基本障碍物评估组件。
    * scale: 定义了该障碍物评估在整体评估中的权重或影响程度。
    * sum\_scores: 指示是否累加多个障碍物的分数，false可能表示使用最大值或其他逻辑。

  * GoalAlign, GoalDist, PathAlign, PathDist, RotateToGoal, Oscillation: 这些都是路径跟随过程中的不同评估或行为组件，每个都有其特定的参数和用途，如对齐目标、保持与目标或路径的距离、减少振荡等。

  * acc\_lim\_theta, acc\_lim\_x, acc\_lim\_y: 这些参数定义了机器人在不同方向上的加速度限制。

  * critics: 指定了哪些评估组件（或“批评家”）将被用于路径跟随决策。

  * debug\_trajectory\_details: 指示是否发布轨迹的详细调试信息。

  * 其他与速度、加速度、时间粒度、轨迹生成等相关的参数，共同定义了路径跟随算法的行为和性能。
* controller\_frequency: 指定了控制器（可能是FollowPath或其他控制器）的运行频率，以赫兹为单位。

* controller\_plugins: 指定了将要使用的控制器插件列表，这里只包含了FollowPath。

* failure\_tolerance: 定义了容忍失败的时间或距离，用于在评估控制器是否失败时提供一定的缓冲。

* general\_goal\_checker: 定义了一个通用的目标检查器，用于确定机器人是否已达到其目标位置和方向。

* goal\_checker\_plugins: 指定了将要使用的目标检查器插件列表。

* min\_theta\_velocity\_threshold, min\_x\_velocity\_threshold, min\_y\_velocity\_threshold: 这些定义了机器人在不同方向上的最小速度阈值，低于这些阈值可能被视为停止或静止。

* odom\_topic: 指定了里程计信息的ROS主题。

* progress\_checker: 定义了一个进度检查器，用于评估机器人是否在向目标移动。

* qos\_overrides: 定义了ROS服务或主题的QoS（服务质量）覆盖设置，用于调整消息传递的可靠性和性能。

* speed\_limit\_topic: 指定了速度限制信息的ROS主题。

* use\_sim\_time: 指示是否使用模拟时间，这在ROS仿真环境中非常有用。

#### 4./local\_costmap/local\_costmap订阅的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /local\_costmap/footprint | geometry\_msgs/msg/Polygon | 机器人或移动平台的足迹多边形，用于本地代价地图的计算 |
| /scan | sensor\_msgs/msg/LaserScan | 激光扫描仪的扫描数据，用于环境感知和避障 |

#### 5./local\_costmap/local\_costmap发布的话题

| 话题 | 接口 | 描述 |
| :--- | :--- | :--- |
| /local\_costmap/clearing\_endpoints | sensor\_msgs/msg/PointCloud2 | 清除成本图上的障碍物点云数据，通常用于动态障碍物处理 |
| /local\_costmap/costmap | nav\_msgs/msg/OccupancyGrid | 本地成本图，表示机器人周围环境的可通行性 |
| /local\_costmap/costmap\_raw | nav2\_msgs/msg/Costmap | 未经处理的本地成本图，可能包含更详细的信息 |
| /local\_costmap/costmap\_updates | map\_msgs/msg/OccupancyGridUpdate | 本地成本图的更新信息，包括哪些区域发生了变化 |
| /local\_costmap/published\_footprint | geometry\_msgs/msg/PolygonStamped | 发布的机器人足迹多边形，时间戳表示发布时间 |
| /local\_costmap/voxel\_grid | nav2\_msgs/msg/VoxelGrid | 体素网格数据，用于成本图生成中的空间划分和优化 |

#### 6./local\_costmap/local\_costmap参数

* `/bond_disable_heartbeat_timeout`: 是否禁用节点间的心跳超时检查。当设置为`true`时，表示禁用该功能，可能用于减少网络通信量或适应特定网络环境。

* `always_send_full_costmap`: 是否总是发送完整的成本图。当设置为`true`时，节点将不依赖于增量更新，而是始终发送完整的成本图数据。

* `clearable_layers`: 指定可以被清除的层列表。在这个例子中，包括`obstacle_layer`、`voxel_layer`和`range_layer`，这意味着这些层中的障碍物数据可以被清除。

* `filters`: 用于指定应用于成本图的过滤器列表。此处为空，表示没有应用任何过滤器。

* `footprint`: 机器人的足迹多边形，定义了机器人在二维空间中的物理占用区域。

* `footprint_padding`: 足迹的填充量，用于在计算成本图时给机器人足迹添加额外的空间。

* `global_frame`: 全局参考坐标系的名称，通常用于定位和导航任务。

* `height`: 成本图的高度（以单元格数量计）。

* `inflation_layer`: 膨胀层的配置，用于在障碍物周围添加一定范围的膨胀区域，使机器人与障碍物保持安全距离。

* `lethal_cost_threshold`: 致命成本阈值，超过此阈值的成本值表示不可通行的区域。

* `map_topic`: 订阅的地图主题名称，用于获取全局地图信息。

* `observation_sources`: 观察源的配置，用于指定哪些传感器数据将被用于更新成本图。此处为空字符串，可能是默认值或配置方式的不同。

* `obstacle_layer`: 障碍物层的配置，用于处理来自传感器（如激光雷达）的障碍物数据。

* `origin_x`,`origin_y`: 成本图原点的X和Y坐标，定义了成本图在全局坐标系中的位置。

* `plugins`: 启用的插件列表，定义了成本图使用的不同层（如障碍物层、膨胀层等）。

* `publish_frequency`: 成本图的发布频率（以Hz为单位）。

* `resolution`: 成本图的分辨率（以米/单元格计）。

* `robot_base_frame`: 机器人基座的参考坐标系名称，用于定位机器人。

* `robot_radius`: 机器人的半径，用于在成本图中表示机器人的物理尺寸。

* `rolling_window`: 是否使用滚动窗口。当设置为`true`时，成本图将随着机器人的移动而更新其位置和范围。

* `track_unknown_space`: 是否跟踪未知空间。在某些情况下，这可能用于处理未探索或未知的区域。

* `transform_tolerance`: 变换容差，定义了接受变换的时间差和角度差的阈值。

* `trinary_costmap`: 是否使用三态成本图（通常是自由、占用、未知）。

* `unknown_cost_value`: 未知区域在成本图中的成本值。

* `update_frequency`: 成本图的更新频率（以Hz为单位），不同于发布频率。

* `use_maximum`: 是否在多个源提供相同位置的成本信息时使用最大值。

* `use_sim_time`: 是否使用模拟时间而非系统时间。这在仿真环境中很有用。

* `voxel_layer`: 体素层的配置，用于将三维空间划分为体素（体积像素），以提高成本图的处理效率。



