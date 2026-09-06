### 4.6.3 多车定位实现

多车编队导航与单车导航一样，也需要依赖于地图与定位。

#### 1.地图服务

一般情况下，多车编队导航时，所有机器人都运行在同一张地图上，因此所有机器人公用一个地图服务即可。在此，我们可以复用**4.3.6 地图读取基本操作**一节中的相关实现。

#### 2.定位实现

不同的机器人，地图服务虽然可以公用，但定位必须要各自实现。我们可以基于**4.4 定位AMCL**一节中`mycar_localization` 功能包实现多车定位。

首先请进入`mycar_localization` 的功能包的launch目录，新建一个名为`mycar_loca_multi.launch.py`的文件，并输入如下内容：

```py
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.actions import GroupAction

def generate_launch_description():

    ld = LaunchDescription()
    car_nums = ["robot_0","robot_1","robot_2"]
    amcl_yaml = os.path.join(get_package_share_directory('mycar_localization'),
        'params','amcl.yaml')

    for car_num in car_nums:
        group = GroupAction([
            Node(
                package='nav2_amcl',
                executable='amcl',
                namespace=car_num,
                name='amcl',
                output='screen',
                parameters=[
                    amcl_yaml,
                    {'base_frame_id': car_num + '/base_link'},
                    {'odom_frame_id': car_num + '/odom'},
                    {'scan_topic': 'base_scan'}
                ],
                remappings=[('map','/map')]
            ),
            Node(
                package='nav2_lifecycle_manager',
                executable='lifecycle_manager',
                namespace=car_num,
                name='lifecycle_manager_localization',
                output='screen',
                parameters=[{'use_sim_time': True},
                    {'autostart': True},
                    {'node_names': ['amcl']}]
            )
        ])
        ld.add_action(group)

    map_server_launch = IncludeLaunchDescription(
        launch_description_source=PythonLaunchDescriptionSource(
            launch_file_path=([get_package_share_directory("mycar_map_server"),"/launch/map_server.launch.py"])
        )
    )
    ld.add_action(map_server_launch)
    return ld

```

在上述文件中，通过列表设置了多机器人名称，并遍历该列表，为每一个机器人设置所需要读取的配置文件，再以组管理的方式设置该机器人的定位节点以及定位节点生命周期管理器。最后还包含了地图服务相关的launch文件。



#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_localization
```

#### 4.执行

（1）请先调用如下指令启动仿真环境：

```
. install/setup.bash
ros2 launch stage_ros2 my_house_multi.launch.py
```

（2）然后进入当前工作空间新建终端，输入如下指令：

```
. install/setup.bash
ros2 launch mycar_localization mycar_loca_multi.launch.py
```

（3）新建三个终端，分别启动三台机器人对应的键盘控制节点。

终端1输入如下指令：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r /cmd_vel:=/robot_0/cmd_vel
```

终端2输入如下指令：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r /cmd_vel:=/robot_1/cmd_vel
```

终端3输入如下指令：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard --ros-args -r /cmd_vel:=/robot_2/cmd_vel
```

（4）在rviz2中，将Fixed Frme设置为map，添加TF插件，按照 **4.3.6 地图读取基本操作 **添加并显示地图。

接下来，为三台机器人分别设置初始化位姿。

右击rviz2菜单栏的`2D Pose Estimate`，并选择弹出列表中的`Tool Properties`，在新的弹窗中，为`2D Pose Estimate`下的`Topic`添加命名空间`robot_0`，然后在地图中为第一个机器人设置一个初始位姿。

![](/assets/4.6.2_定位.PNG)

再添加`ParticleCloud`插件，将话题设置为`/robot_0/particle_cloud`，并将话题下`Reliability Policy`设置为`Best Effort`，最后使用对应键盘控制机器人运动，会发现，机器人周边会出现点云，并且随着机器人的运动，点云会出现不同程度的收敛或发散。

第二台和第三台机器人初始化位姿也遵循上述步骤，最终效果如下图。

![](/assets/4.6.2_定位2.PNG)

