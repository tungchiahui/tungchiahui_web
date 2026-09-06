### 2.2.5 雷达融合与过滤联合应用

**需求：**继案例1雷达融合之后，可以继续对雷达数据进行优化，过滤掉采集到的车身以及附属物数据。

过滤后的数据![](/assets/1.4.7_04雷达融合后过滤.PNG)

**实现：**

①.在launch目录下新建实现雷达过滤的文件：mycar\_two\_laser\_filter.launch.py，并在案例1的mycar\_two\_laser.launch.py中包含新建的launch文件。

修改mycar\_two\_laser.launch.py，修改后的内容如下：

```py
import os
from launch_ros.actions import Node
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from ament_index_python.packages import get_package_share_directory



def generate_launch_description():



    laser_down_baselink_tf = Node(
        package="tf2_ros",
        executable="static_transform_publisher",
        arguments=["--z", "0.05", "--frame-id","base_link","--child-frame-id","laser_down"]
    )
    laser_up_baselink_tf = Node(
        package="tf2_ros",
        executable="static_transform_publisher",
        arguments=["--z", "0.35", "--frame-id","base_link","--child-frame-id","laser_up"]
    )
    # 启动两个激光雷达
    laser_up = Node(
        package='sllidar_ros2',
        executable='sllidar_node',
        name='sllidar_node_up',
        parameters=[{'serial_port': "/dev/laser_up", 
                        'serial_baudrate': 115200, 
                        'frame_id': "laser_up",
                        'angle_compensate': True,
                        'inverted': False,
                        }],
        remappings=[("/scan","/scan_up")],
        output='screen')
    laser_down = Node(
        package='sllidar_ros2',
        executable='sllidar_node',
        name='sllidar_node_down',
        parameters=[{'serial_port': "/dev/laser_down", 
                        'serial_baudrate': 115200, 
                        'frame_id': "laser_down",
                        'angle_compensate': True,
                        'inverted': False,
                        }],
        remappings=[("/scan","/scan_down")],
        output='screen')
    # 进行雷达融合
    merger_launch = IncludeLaunchDescription(
        launch_description_source= PythonLaunchDescriptionSource(
            launch_file_path=os.path.join(
                get_package_share_directory("mycar_laser_merger"),
                "launch",
                "mycar_two_laser_merger.launch.py"
            )
        )
    )
    # 过滤
    filter_launch = IncludeLaunchDescription(
        launch_description_source= PythonLaunchDescriptionSource(
            launch_file_path=os.path.join(
                get_package_share_directory("mycar_laser_merger"),
                "launch",
                "mycar_two_laser_filter.launch.py"
            )
        )
    )
    return LaunchDescription([laser_down_baselink_tf,laser_up_baselink_tf,laser_up,laser_down,merger_launch,filter_launch])
```

在mycar\_two\_laser\_filter.launch.py文件中输入如下内容：

```py
from launch import LaunchDescription
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory

# 过滤融合后的数据。
def generate_launch_description():
    # 去除一个立方体内扫描到的数据。
    return LaunchDescription([
        Node(
            package="laser_filters",
            executable="scan_to_scan_filter_chain",
            parameters=[
                PathJoinSubstitution([
                    get_package_share_directory("mycar_laser_merger"),
                    "params", "box_filter.yaml",
                ])],
            remappings=[("/scan","/scan_multi"),("/scan_filtered","/scan")],
        )
    ])
```

上述过滤器实现与**1.4.6 雷达过滤器——laser\_filters**中的案例实现类似，唯一的区别是重映射了雷达的输入话题和输出话题。

在功能包的params目录下，新建名为box\_filter.yaml的文件（也即mycar\_two\_laser\_filter.launch.py中加载的yaml文件），并输入如下内容：

```yaml
scan_to_scan_filter_chain:
  ros__parameters:
    filter1:
      name: box_filter
      type: laser_filters/LaserScanBoxFilter
      params:
        box_frame: base_link #参考坐标系
        max_x: 0.20
        max_y: 0.15
        max_z: 0.5
        min_x: -0.20
        min_y: -0.15
        min_z: -0.1

        invert: false # 是否反转，如果设置为 true，那么会只保留立方体内的数据。
```

②.执行launch文件mycar\_two\_laser.launch.py并启动rviz2。

rviz2启动之后，将`Fixed Frame`设置为base\_link，并添加LaserScan插件，设置订阅的话题为`/scan`，即可显示过滤后的数据。

最后，激光雷达数据经过融合且过滤后，下一步就可以与机器人底盘集成了。

