## 2.1 点云转单线激光雷达消息

## 点云转激光

#### 1.安装

sudo apt install ros-humble-pointcloud-to-laserscan

#### 2.测试内置案例

点云转激光雷达： ros2 launch pointcloud\_to\_laserscan sample\_pointcloud\_to\_laserscan\_launch.py激光雷达转点云： ros2 launch pointcloud\_to\_laserscan sample\_laserscan\_to\_pointcloud\_launch.py

启动rviz查看结果时，注意坐标系的设置，并且Reliability Policy 设置为 System Default。

#### 3.自调用

ros2 pkg create pcl\_and\_laserscan --build-type ament\_cmake --dependencies rclcpp pointcloud\_to\_laserscan

功能包下新建launch目录，并在CMakeLists.txt中添加:install\(DIRECTORY launch DESTINATION share/${PROJECT\_NAME}\)

新建launch文件:pcl2scan\_launch.py

```
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():

    return LaunchDescription([
        Node(
            package="tf2_ros",
            executable="static_transform_publisher",
            name="laser2baselink",
            # arguments=["0","0","0.15","0","0","0","base_link","rslidar"]
            arguments=["0","0","0.15","0","0","0","base_link","laser"]
        ),
        Node(
            package="pointcloud_to_laserscan",
            executable="pointcloud_to_laserscan_node",
            name="pcl2scan",
            # remappings=[('cloud_in', '/rslidar_points'),
            remappings=[('cloud_in', '/pcl'),
                        ('scan', '/scan')],
            parameters=[{
                # 'target_frame': 'rslidar',
                'target_frame': 'laser',
                'transform_tolerance': 0.01,
                'min_height': 0.0,
                'max_height': 1.0,
                'angle_min': -1.5708,  # -M_PI/2
                'angle_max': 1.5708,  # M_PI/2
                'angle_increment': 0.0087,  # M_PI/360.0
                'scan_time': 0.3333,
                'range_min': 0.15,
                'range_max': 40.0,
                'use_inf': True,
                'inf_epsilon': 1.0
            }],
        )
    ])
```

运行：1.启动点云发布节点（可以是仿真或深度相机或多线激光雷达）；2.启动转换节点；3.rviz2查看结果。

新建launch文件:scan2pcl\_launch.py

```
from launch import LaunchDescription
from launch_ros.actions import Node

import yaml


def generate_launch_description():
    return LaunchDescription([

        Node(
            package="tf2_ros",
            executable="static_transform_publisher",
            name="static_transform_publisher",
            arguments=["0", "0", "0.2", "0", "0", "0", "base_link", "laser"]
        ),
        Node(
            package="pointcloud_to_laserscan",
            executable="laserscan_to_pointcloud_node",
            name="laserscan_to_pointcloud",
            remappings=[("scan_in", "scan"),
                        ("cloud", "cloud")],
            parameters=[{"target_frame": "laser", "transform_tolerance": 0.01}]
        ),
    ])
```

运行：1.启动单线激光雷达雷达消息发布节点（可以是仿真或单线线激光雷达）；2.启动转换节点；3.rviz2查看结果。

单线转点云的作用：可以使用点云相关库方便快捷的处理数据。

