### 2.2.5 点云数据与激光扫描互转简介

多线激光雷达可用于获取周围环境的点云数据。然而，在某些情况下，我们可能希望利用基于激光扫描的算法对环境进行障碍物检测和地图构建。然而基于激光扫描的算法无法直接处理点云数据，只能处理激光扫描数据。因此，在这种情况下，我们需要将点云数据转换为激光扫描数据。相反，点云数据提供了更多的自由度和灵活性，可以应用更高级的算法和处理。例如，可以利用点云数据进行聚类分析、表面重建、环境建模等。通过将激光扫描数据转换为点云数据，我们能够利用点云处理库和算法。总而言之，点云数据与激光扫描之间的相互转换具有现实意义，那么我们该如何实现它们之间的转换呢？在ROS2中提供了 pointcloud\_to\_laserscan 功能包，可以解决上述问题。

#### 1.功能包简介

pointcloud\_to\_laserscan功能包提供了两个节点：

* laserscan\_to\_pointcloud\_node

* pointcloud\_to\_laserscan\_node

前者可以将激光扫描消息（sensor\_msgs/msg/LaserScan）转换为点云消息（sensor\_msgs/msg/PointCloud2），后者则可以实现反向转换。

该功能包的安装指令如下：

```
sudo apt install ros-${ROS_DISTRO}-pointcloud-to-laserscan
```



#### 2.laserscan\_to\_pointcloud\_node节点说明

该节点可以将激光扫描消息（sensor\_msgs/msg/LaserScan）转换为点云消息（sensor\_msgs/msg/PointCloud2）。

##### 发布的话题

* `cloud`\(`sensor_msgs/msg/PointCloud2`\) -输出的点云数据。

##### 订阅的话题

* `scan_in`\(`sensor_msgs/msg/LaserScan`\) - 输入的激光扫描数据。如果没有订阅器订阅`cloud`话题，则不会处理任何输入数据。

##### 参数

* `queue_size`\(double, 默认值: 检测到的数量\) -输入激光扫描队列的大小。
* `target_frame`\(str, 默认值: none\) --如果提供了该参数，输出的点云数据将使用该坐标系。否则，点云数据将在与输入激光扫描相同的坐标系中生成。
* `transform_tolerance`\(double, 默认值: 0.01\) - 转换查找的时间容差。仅在提供了目标帧（`target_frame`）时使用。

#### 3.pointcloud\_to\_laserscan\_node节点说明

该节点可以将点云消息（sensor\_msgs/msg/PointCloud2）转换为激光扫描消息（sensor\_msgs/msg/LaserScan）。

##### 发布的话题

* `scan`\(`sensor_msgs/msg/LaserScan`\) - 输出激光扫描。

##### 订阅的话题

* `cloud_in`\(`sensor_msgs/msg/PointCloud2`\) - 输入的点云数据。如果没有订阅者订阅`scan`话题，将不会处理任何输入数据。

##### 参数

* `min_height`\(double, 默认值: 2.2e-308\) - 在点云中进行采样的最小高度，单位为米。
* `max_height`\(double, 默认值: 1.8e+308\) - 在点云中进行采样的最大高度，单位为米。
* `angle_min`\(double, 默认值: -π\) - 扫描的最小角度，以弧度为单位。
* `angle_max`\(double, 默认值: π\) - 扫描的最大角度，以弧度为单位。
* `angle_increment`\(double, 默认值: π/180\) -激光扫描中每个射线的分辨率，以弧度为单位。
* `queue_size`\(double, 默认值:检测到的数量\) - 输入点云队列的大小。
* `scan_time`\(double, 默认值: 1.0/30.0\) -扫描速率，以秒为单位。仅用于填充输出激光扫描消息的`scan_time`字段。
* `range_min`\(double, 默认值: 0.0\) - 返回的最小测距范围，以米为单位。
* `range_max`\(double, 默认值: 1.8e+308\) -返回的最大测距范围，以米为单位。
* `target_frame`\(str, 默认值: none\) -如果提供了该参数，输出的激光扫描将使用该坐标系。否则，激光扫描将在与输入点云相同的坐标系中生成。
* `transform_tolerance`\(double, 默认值: 0.01\) - 这是用于转换查找的时间容差参数，仅在提供了目标坐标系（`target_frame`）时使用。
* `use_inf`\(boolean, 默认值: true\) -如果禁用此选项，则将无限范围（无障碍物）报告为 range\_max + 1。否则，将将无限范围报告为正无穷（+inf）。

#### 



