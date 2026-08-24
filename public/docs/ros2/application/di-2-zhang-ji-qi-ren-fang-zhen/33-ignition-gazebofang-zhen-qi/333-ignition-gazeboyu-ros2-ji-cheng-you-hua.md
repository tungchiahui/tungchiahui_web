### 3.3.4 Ignition Gazebo与ROS2集成优化

在**3.3.2 Ignition Gazebo与ROS2集成**实现中需要在终端中使用不同的指令启动不同模块，该流程实现稍显复杂，本节将介绍如何以launch文件的方式进行优化。

#### 1.新建功能包

请首先调用如下指令创建一个功能包：

```
ros2 pkg create demo_gazebo_sim
```

#### 2.添加目录

在新建的功能包下添加目录： launch、rviz、world。并在CmakeLists.txt中添加如下代码：

```
install(DIRECTORY rviz world launch DESTINATION share/${PROJECT_NAME})
```

launch目录用于存储launch文件，rviz目录由于存储rviz2的配置文件，而world目录则用于存储Ignition  Gazebo仿真环境的相关文件。

#### 3.rviz目录中生成rviz2的配置文件

启动 rviz2，直接将默认配置保存至当前功能包的rviz目录，保存文件命名为sim.rviz。

#### 4.复制world文件

在ignition安装路径下的worlds目录（/usr/share/ignition/ignition-gazebo6/worlds）中复制visualize\_lidar.sdf文件至world目录。

#### 5.编写launch文件

launch目录下新建launch文件gazebo\_sim\_demo.launch.py，并输入如下内容：

```py
import os

from ament_index_python.packages import get_package_share_directory

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.actions import IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration

from launch_ros.actions import Node


def generate_launch_description():

    this_pkg = get_package_share_directory('demo_gazebo_sim')
    pkg_ros_gz_sim = get_package_share_directory('ros_gz_sim')
    world_file = os.path.join(this_pkg,'world','visualize_lidar.sdf')

    gz_sim = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(pkg_ros_gz_sim, 'launch', 'gz_sim.launch.py')),
        launch_arguments={
            'gz_args': '-r ' + world_file
        }.items(),
    )

    # RViz
    rviz = Node(
       package='rviz2',
       executable='rviz2',
       arguments=['-d', os.path.join(this_pkg, 'rviz', 'sim.rviz')],
       condition=IfCondition(LaunchConfiguration('rviz'))
    )

    # Bridge
    bridge = Node(
        package='ros_gz_bridge',
        executable='parameter_bridge',
        arguments=['/model/vehicle_blue/cmd_vel@geometry_msgs/msg/Twist@gz.msgs.Twist',
                   '/model/vehicle_blue/odometry@nav_msgs/msg/Odometry@gz.msgs.Odometry',
                   '/model/vehicle_blue/tf@tf2_msgs/msg/TFMessage[gz.msgs.Pose_V',
                   ],
        parameters=[{'qos_overrides./model/vehicle_blue.subscriber.reliability': 'reliable'}],
        remappings=[
                ('/model/vehicle_blue/tf', '/tf'),
                ('/model/vehicle_blue/cmd_vel','cmd_vel')
            ],
        output='screen'
    )

    return LaunchDescription([
        gz_sim,
        DeclareLaunchArgument('rviz', default_value='true',
                              description='Open RViz.'),
        bridge,
        rviz
    ])
```

该launch文件中，启动了Ignition Gazebo仿真环境、通过ros\_gz\_bridge建立了仿真与ROS2的连接，并且启动了rviz2节点。其中建立连接时，实现了速度指令、里程计以及坐标变换等消息的转换。

#### 6.构建

终端中进入当前工作空间，编译功能包：

```
colcon build  --packages-select demo_gazebo_sim
```

#### 7.执行

终端中进入当前工作空间，调用如下指令执行launch文件：

```
. install/setup.bash
ros2 launch demo_gazebo_sim gazebo_sim_demo.launch.py
```

新开终端，启动键盘控制节点：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard
```

再配置rviz2，将`Fixed Frame`设置为`vehicle_blue/odom`，添加TF插件，添加Odometry插件并将话题设置为`/model/vehicle_blue/odometry`，当通过键盘控制发送速度指令时，仿真环境的机器人开始运动，并且在rviz2中可以回显坐标变换以及里程计等消息。

![](/assets/3.3.3_launch集成演示.gif)

