### 2.2.4 雷达融合应用

本节我们将通过两个案例来演示ira\_laser\_tools功能包的基本使用。

#### 1.准备工作

首先请创建一个功能包，指令如下：

```
ros2 pkg create mycar_laser_merger --dependencies ira_laser_tools
```

在功能包下新建launch与params目录，并修改功能包下的CMakeLists.txt文件，添加如下代码：

```
install(DIRECTORY params launch DESTINATION share/${PROJECT_NAME})
```

准备工作完毕，接下来就可以进入案例部分了。

#### 2.雷达融合

##### （1）需求

机器人在纵向上安装有上下两个激光雷达，两个激光雷达分别安装在底盘中心（base\_link）正上方0.05m和0.35m处，请融合激光雷达数据，并在rviz2中查看结果。

上雷达采集的数据![](/assets/1.4.7_01上雷达.PNG)

下雷达采集的数据![](/assets/1.4.7_02下雷达.PNG)

融合后数据![](/assets/1.4.7_03雷达融合.PNG)

##### （2）实现

①.准备工作：请先按照**1.3.2 USB端口绑定**的相关内容为两个雷达端口映射别名，比如可以分别为laser\_up和laser\_down。

②.进入launch目录，新建两个launch文件，分别名为mycar\_two\_laser.launch.py和mycar\_two\_laser\_merger.launch.py。

在mycar\_two\_laser.launch.py文件中输入如下内容：

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

    return LaunchDescription([laser_down_baselink_tf,laser_up_baselink_tf,laser_up,laser_down,merger_launch])
```

在上述文件中，主要做了如下操作：

* 发布了两个雷达相对于base\_link的静态坐标变换；
* 启动了两个雷达（此处可根据自己实际使用的雷达自行修改）；
* 包含了雷达融合的launch文件。

在mycar\_two\_laser\_merger.launch.py文件中输入如下内容：

```py
from launch_ros.actions import Node
from launch import LaunchDescription
from ament_index_python.packages import get_package_share_directory
import launch_ros.actions
import os

# 融合两个激光雷达
def generate_launch_description():

    return LaunchDescription([

        Node(
            package='ira_laser_tools',
            executable='laserscan_multi_merger',
            name='laserscan_multi_merger',
            parameters=[os.path.join(get_package_share_directory("mycar_laser_merger"), "params", "laserscan_multi_merger.yaml")],
            output='screen'),
    ])
```

上述文件主要用于实现雷达数据融合，它启动了ira\_laser\_tools功能包下的laserscan\_multi\_merger节点，并且加载了一个yaml文件用于配置参数。

在功能包的params目录下，新建名为laserscan\_multi\_merger.yaml的文件（也即mycar\_two\_laser\_merger.launch.py中加载的yaml文件），并输入如下内容：

```yaml
/laserscan_multi_merger:
  ros__parameters:
    angle_increment: 0.0058
    angle_max: 3.14
    angle_min: -3.14
    cloud_destination_topic: /merged_cloud
    destination_frame: base_link
    laserscan_topics: /scan_up /scan_down
    range_max: 25.0
    range_min: 0.0
    scan_destination_topic: /scan_multi
    scan_time: 0.0
    use_sim_time: false
```

上述文件主要配置了雷达融合所需要的一些参数。

③.构建功能包，执行launch文件mycar\_two\_laser.launch.py并启动rviz2。

rviz2启动之后，将`Fixed Frame`设置为base\_link，并添加三个LaserScan插件，三个插件订阅的话题分别设置为`/scan_up`、`/scan_down`和`scan_multi`即可分别显示上雷达采集的数据、下雷达采集的数据和上下雷达融合后的数据，不过，需要注意的是为了保证订阅`scan_multi`的插件数据可以正常显示，需要将该插件的`topic`下的`Reliability Policy`设置为`System Default`或`Best Effort`。

#### 3.融合后再过滤

##### （1）需求

继雷达融合之后，可以对雷达数据继续优化，过滤掉采集到的车身以及附属物数据。

过滤后的数据![](/assets/1.4.7_04雷达融合后过滤.PNG)

##### （2）实现

①.在launch目录下新建实现雷达过滤的文件：mycar\_two\_laser\_filter.launch.py，并在mycar\_two\_laser.launch.py中包含新建的launch文件。

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

上述过滤器实现与**2.2.2 雷达过滤器应用**中的案例实现类似，唯一的区别是重映射了雷达的输入话题和输出话题。

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

②.构建功能包，执行launch文件mycar\_two\_laser.launch.py并启动rviz2。

rviz2启动之后，将`Fixed Frame`设置为base\_link，并添加LaserScan插件，设置订阅的话题为`/scan`，即可显示过滤后的数据。

##### 



