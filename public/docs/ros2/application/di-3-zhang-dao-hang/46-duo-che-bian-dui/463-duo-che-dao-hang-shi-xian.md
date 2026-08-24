### 4.6.4 多车导航实现

接下来，需要让每台机器人可以各自实现导航功能。

#### 1.编写launch文件与参数文件

我们可以基于**4.5.9 导航功能集成**一节中创建的`mycar_navigation2`编写launch文件与参数文件。

首先，在launch目录下新建名为`nav2_multi.launch.py`的文件，并输入如下内容：

```py
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import GroupAction


def generate_launch_description():

    current_pkg = get_package_share_directory("mycar_navigation2")
    ld = LaunchDescription()
    car_nums = ["robot_0","robot_1","robot_2"]

    bt_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params", "bt.yaml")
    behavior_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params","behavior.yaml")       
    waypoint_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params","waypoint.yaml")       
    velocity_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params","velocity.yaml")       
    smoother_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params","smoother.yaml")       

    for car_num in car_nums:

        planner_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params", car_num,"planner.yaml")       
        controller_params = os.path.join(get_package_share_directory("mycar_navigation2"),"params", car_num,"controller.yaml")       


        group = GroupAction([
            Node(
                package='nav2_planner',
                executable='planner_server',
                name='planner_server',
                namespace=car_num,
                output='screen',
                parameters=[

                    planner_params
                ],
            ),
            Node(
                package='nav2_controller',
                executable='controller_server',
                namespace=car_num,
                output='screen',
                parameters=[

                    controller_params,
                ],
                remappings=[('cmd_vel', 'cmd_vel_nav')]
            ),
            Node(
                package='nav2_behaviors',
                executable='behavior_server',
                name='behavior_server',
                namespace=car_num,
                output='screen',
                parameters=[
                    behavior_params,
                    {'global_frame': car_num + '/odom'},
                    {'robot_base_frame': car_num + '/base_link'},
                ]
            ),
            Node(
                package='nav2_waypoint_follower',
                executable='waypoint_follower',
                namespace=car_num,
                name='waypoint_follower',
                output='screen',
                parameters=[waypoint_params]
            ),
            Node(
                package='nav2_velocity_smoother',
                executable='velocity_smoother',
                namespace=car_num,
                name='velocity_smoother',
                output='screen',
                respawn_delay=2.0,
                parameters=[
                    velocity_params,
                    {'odom_topic': 'odom'}
                ],
                remappings=
                        [('cmd_vel', 'cmd_vel_nav'), ('cmd_vel_smoothed', 'cmd_vel')]
            ),
            Node(
                package='nav2_smoother',
                executable='smoother_server',
                namespace=car_num,
                name='smoother_server',
                output='screen',
                parameters=[
                    smoother_params,
                    {'robot_base_frame': car_num + '/base_link'}

                ],
            ),
            Node(
                package='nav2_bt_navigator',
                executable='bt_navigator',
                namespace=car_num,
                name='bt_navigator',
                output='screen',      
                parameters=[
                    bt_params,
                    {'robot_base_frame': car_num + '/base_link'},
                    {'odom_topic': 'odom'},
                    {"default_nav_to_pose_bt_xml": os.path.join(current_pkg,"bts","bt_planner_controller_behavior.xml")},
                    {"default_nav_through_poses_bt_xml": os.path.join(current_pkg,"bts","bt_planner_controller_behavior_poses.xml")}
                ],
            ),
            Node(
                package='nav2_lifecycle_manager',
                executable='lifecycle_manager',
                namespace=car_num,
                name='lifecycle_manager_navigation',
                output='screen',
                parameters=[{'use_sim_time': True},
                            {'autostart': True},
                            {'node_names': [
                                'bt_navigator',
                                'planner_server',
                                'controller_server',
                                'behavior_server',
                                'waypoint_follower',
                                'velocity_smoother',
                                'smoother_server'
                ]}]
            )
        ])
        ld.add_action(group)

    return ld
```

在上述文件中，通过列表设置了多机器人名称，并遍历该列表，为每一个机器人设置导航所需要读取的配置文件，再以组管理的方式设置该机器人导航所需的节点。

在params目录下还需要新建robot\_0、robot\_1和robot\_2三个目录，分别为三辆车设置路径规划和运动控制相关文件，可以直接复制**4.5.9 导航功能集成**一节中的`planner.yaml`和`controller.yaml`到这三个目录，然后进行修改。

在具体的修改参数上，三者类似，其中 planner.yaml 需要重新设置robot\_base\_frame为当前机器人的基坐标系，map\_topic设置为`/map`，雷达话题则设置为当前机器人的雷达话题。

#### 2.launch集成

多车导航实现时，需要依赖于地图与多车定位功能，我们可以在一个launch文件中集成之前的多车定位launch以及当前编写的多车导航核心模块的launch，以简化导航功能的启动，在launch目录下新建一个名为`bringup_multi.launch.py`的launch文件，并输入如下内容：

```py
import os

from ament_index_python.packages import get_package_share_directory

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource


def generate_launch_description():

    amcl_pkg = get_package_share_directory("mycar_localization")
    nav2_pkg = get_package_share_directory("mycar_navigation2")

    amcl_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(amcl_pkg,'launch',
                                                    'mycar_loca_multi.launch.py'))
        )

    nav2_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(nav2_pkg,'launch', 
                                                    'nav2_multi.launch.py'))
        )
    ld = LaunchDescription()
    ld.add_action(amcl_launch)
    ld.add_action(nav2_launch)
    return ld
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select mycar_navigation2
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
ros2 launch mycar_navigation2 bringup_multi.launch.py
```

（3）导航实现。

请先按照**4.6.2 多车定位实现**一节的内容实现车辆定位功能，然后，在`Tool Properties`弹窗中，为`2D Goal Pose`下的`Topic`添加命名空间`robot_0`，然后在地图中为第一个机器人设置一个目标点，第一台机器人就可以自主导航移动了。

第二台和第三台机器人导航也遵循上述步骤，最终效果如下图（下图实现中还添加Path插件以显示机器人规划的路径）。

![](/assets/4.6.3_多车导航.PNG)

