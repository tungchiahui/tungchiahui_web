### 4.2.8 cartogarpher基本使用

#### 1.准备工作

在src目录下，请先调用如下指令在工作空间的src目录下创建一个功能包：

```
ros2 pkg create mycar_slam_cartographer --dependencies cartographer
```

#### 2.编写launch文件与参数文件

在功能包下，新建launch目录和params目录，launch目录下新建`cartographer.launch.py`文件并输入如下内容：

```py
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
import os
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():

    use_sim_time_arg = DeclareLaunchArgument('use_sim_time', default_value = 'True')

    cartographer_node = Node(
        package = 'cartographer_ros',
        executable = 'cartographer_node',
        parameters = [{'use_sim_time': LaunchConfiguration('use_sim_time')}],
        arguments = [
            '-configuration_directory', os.path.join(get_package_share_directory("mycar_slam_cartographer"),"params"),
            '-configuration_basename', 'mycar.lua'],
        output = 'screen'
    )

    cartographer_occupancy_grid_node = Node(
        package = 'cartographer_ros',
        executable = 'cartographer_occupancy_grid_node',
        parameters = [
            {'use_sim_time': True},
            {'resolution': 0.05}],
    )

    return LaunchDescription([
        use_sim_time_arg,
        cartographer_node,
        cartographer_occupancy_grid_node,
    ])
```

该launch文件主要是加载了cartographer\_ros下的cartographer\_node与cartographer\_occupancy\_grid\_node节点，并且会从当前功能包的params下读取一个名为mycar.lua的配置文件。这个配置文件还不存在，接下来需要在params目录下新建mycar.lua文件，并输入如下内容：

```lua
include "map_builder.lua" -- 地图构建器
include "trajectory_builder.lua" -- 轨迹构建器

options = {
  map_builder = MAP_BUILDER,
  trajectory_builder = TRAJECTORY_BUILDER,
  map_frame = "map",  -- 地图坐标系
  tracking_frame = "base_link", -- 跟踪的坐标系，可以是基坐标系、雷达或imu的坐标系
  published_frame = "odom", -- cartographer发布的位姿（pose）的坐标系
  odom_frame = "carto_odom",  -- cartographer 计算后优化的里程计，并非机器人本身里程计
  provide_odom_frame = false, -- 是否发布cartographer的里程计
  publish_frame_projected_to_2d = true, -- 是否转换成2d(无俯仰、滚动的情况下为 true)
  use_odometry = true, -- 是否订阅里程计数据
  use_nav_sat = false, -- 是否订阅GPS
  use_landmarks = false, -- 是否订阅路标
  num_laser_scans = 1, -- 订阅的雷达的数量
  num_multi_echo_laser_scans = 0, -- 订阅的多层回波激光雷达数量
  num_subdivisions_per_laser_scan = 1, -- 将激光雷达的数据拆分成多少部分发布
  num_point_clouds = 0, -- 订阅多线激光雷达的数量
  lookup_transform_timeout_sec = 1.5, -- 坐标变换超时时间
  submap_publish_period_sec = 0.5, -- 发布子图的时间间隔
  pose_publish_period_sec = 5e-3, -- 发布pose的时间间隔
  trajectory_publish_period_sec = 30e-3, -- 发布轨迹的时间间隔
  rangefinder_sampling_ratio = 1., -- 雷达采样比例
  odometry_sampling_ratio = 0.8, -- 里程计采样比例(如果里程计精度低，可以减小该设置值)
  fixed_frame_pose_sampling_ratio = 1., -- 参考坐标系采样比例
  imu_sampling_ratio = 1.,-- imu采样比例
  landmarks_sampling_ratio = 1., -- 路标采样比例
}

MAP_BUILDER.use_trajectory_builder_2d = true -- 启用2D轨迹构建器

TRAJECTORY_BUILDER_2D.min_range = 0.15 -- 最小雷达有效距离
TRAJECTORY_BUILDER_2D.max_range = 6.0 -- 最大雷达有效距离
TRAJECTORY_BUILDER_2D.missing_data_ray_length = 3. -- 缺失数据的射线长度
TRAJECTORY_BUILDER_2D.use_imu_data = false -- 是否使用 imu 数据
TRAJECTORY_BUILDER_2D.use_online_correlative_scan_matching = true -- 是否使用在线相关扫描匹配
TRAJECTORY_BUILDER_2D.motion_filter.max_angle_radians = math.rad(0.1) -- 运动滤波器的最大角度限制（以弧度为单位）

POSE_GRAPH.constraint_builder.min_score = 0.65 -- 建约束时的最小分数
POSE_GRAPH.constraint_builder.global_localization_min_score = 0.7 -- 全局定位时的最小分数

-- POSE_GRAPH.optimize_every_n_nodes = 0

return options
```

配置文件的内容需要根据实际情况进行动态调整。

#### 3.编辑配置文件

打开`CMakeLists.txt` 并输入如下内容：

```
install(DIRECTORY launch params
  DESTINATION share/${PROJECT_NAME}
)
```

#### 4.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_slam_cartographer
```

#### 5.执行

（1）请先调用如下指令启动仿真环境：

```
. install/setup.bash
ros2 launch stage_ros2 my_house.launch.py
```

（2）然后在终端下进入当前工作空间，输入如下指令：

```
. install/setup.bash
ros2 launch mycar_slam_cartographer cartographer.launch.py
```

（3）启动rviz2，将Fixed Frame设置为map，添加map插件并将话题设置为/map，即可显示创建的地图了，当机器人运动时，地图也会随之更新。![](/assets/4.2.8_cartographer建图.gif)

