### 4.2.7 cartographer节点说明

在Cartographer框架中，`cartographer_node`和`cartographer_occupancy_grid_node`是两个关键的节点，它们各自承担着不同的角色和功能。详细介绍如下。

> **cartographer\_node：**
>
> 主要负责订阅来自各种传感器的数据（如激光雷达、IMU、里程计等），并基于这些数据实时构建地图。它采用子图（submap）的方法来逐步构建和更新地图，确保定位的准确性和建图的实时性。
>
> **cartographer\_occupancy\_grid\_node：**
>
> 该节点负责接收`cartographer_node`发布的子图列表（`/submap_list`），并将其拼接成完整的栅格地图（occupancy grid map），然后发布这个地图。这个节点是地图生成的最终环节，它使得Cartographer能够输出人类可读且易于可视化的地图。

这两个节点的协同工作，前者负责实时构建和更新地图，后者则负责将子图拼接成完整的栅格地图并发布，使得Cartographer能够高效地实现SLAM功能。

#### 1.cartographer\_node订阅的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /scan | sensor\_msgs/msg/LaserScan | 来自激光雷达输入的扫描数据 |
| /odom | nav\_msgs/msg/Odometry | 里程计消息 |

#### 2.cartographer\_node发布的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /scan\_matched\_points2 | sensors\_msgs/msg/PointCloud2 | 匹配好的点云数据，用于scan-to-submap matching |
| /submap\_list | cartographer\_ros\_msgs/SubmapList | 发布构建好的子图列表 |

#### 3.cartographer\_node发布的服务

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /submap\_query | cartographer\_ros\_msgs/srv/SubmapQuery | 提供查询子图的服务，获取到查询的子图 |
| /start\_trajectory | cartographer\_ros\_msgs/srv/StartTrajectory | 开始一条轨迹 |
| /finish\_trajectory | cartographer\_ros\_msgs/srv/FinishTrajectory | 结束一条给定ID的轨迹 |
| /write\_state | cartographer\_ros\_msgs/srv/WriteState | 将当前状态写入磁盘文件中 |
| /get\_trajectory\_states | cartographer\_ros\_msgs/srv/GetTrajectoryStates | 获取指定轨迹的状态 |
| /read\_metrics | cartographer\_ros\_msgs/srv/ReadMetrics | 读取性能指标 |

#### 4.cartographer\_node参数

`cartographer_node`节点需要接收一个参数配置文件，该配置文件包含了地图构建、轨迹跟踪等所需的各项参数。

#### 5.cartographer\_occupancy\_grid\_node订阅的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /submap\_list | cartographer\_ros\_msgs/SubmapList | 子图列表 |

#### 6.cartographer\_occupancy\_grid\_node发布的话题

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /map | nav\_msgs/msg/OccupancyGrid | 发布的栅格地图 |

#### 7.cartographer\_occupancy\_grid\_node请求的服务

| **话题** | **类型** | **描述** |
| :--- | :--- | :--- |
| /submap\_query | cartographer\_ros\_msgs/srv/SubmapQuery | 获取子图 |

#### 8.cartographer\_occupancy\_grid\_node参数

`cartographer_occupancy_grid_node`节点需要配置地图的分辨率和更新周期等参数，以确保生成的栅格地图满足特定的精度和实时性要求。

  


