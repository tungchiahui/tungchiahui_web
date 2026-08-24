### 4.4.2 定位节点基本操作

#### 1.准备工作

请先调用如下指令在工作空间的src目录下创建一个功能包：

```
ros2 pkg create mycar_localization --dependencies nav2_amcl mycar_map_server
```

#### 2.编写launch文件与参数文件

在功能包下，新建launch和params文件夹，在launch目录下新建名为`mycar_loca.launch.py`的文件，并输入如下内容：

```py
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource

def generate_launch_description():
    amcl_yaml = os.path.join(get_package_share_directory('mycar_localization'),
        'params', 'amcl.yaml')
    amcl_node = Node(
        package='nav2_amcl',
        executable='amcl',
        name='amcl',
        output='screen',
        parameters=[amcl_yaml]
    )
    manager_localization_node = Node(
        package='nav2_lifecycle_manager',
        executable='lifecycle_manager',
        name='lifecycle_manager_localization',
        output='screen',
        parameters=[{'use_sim_time': True},
            {'autostart': True},
            {'node_names': ['amcl']}]
    )
    map_server_launch = IncludeLaunchDescription(
        launch_description_source=PythonLaunchDescriptionSource(
            launch_file_path=([get_package_share_directory("mycar_map_server"),"/launch/map_server.launch.py"])
        )
    )
    return LaunchDescription([amcl_node,manager_localization_node,map_server_launch])
```

在上述代码中，创建了`amcl`节点，并从`params`目录加载了名为`amcl.yaml`的配置文件，且由于`amcl`也是拥有生命周期的节点，所以将其添加进了生命周期管理器。最后，定位必须依赖于地图信息，因此又包含了 **4.3.6 地图读取基本操作**中的launch文件，以加载地图。

在params目录下新建名为`amcl.yaml`的文件，并输入如下内容：

```yaml
/**:
  ros__parameters:
    use_sim_time: True
    alpha1: 0.2
    alpha2: 0.2
    alpha3: 0.2
    alpha4: 0.2
    alpha5: 0.2
    base_frame_id: "base_link"
    beam_skip_distance: 0.5
    beam_skip_error_threshold: 0.9
    beam_skip_threshold: 0.3
    do_beamskip: false
    global_frame_id: "map"
    lambda_short: 0.1
    laser_likelihood_max_dist: 2.0
    laser_max_range: 100.0
    laser_min_range: -1.0
    laser_model_type: "likelihood_field"
    max_beams: 60
    max_particles: 2000
    min_particles: 500
    odom_frame_id: "odom"
    pf_err: 0.05
    pf_z: 0.99
    recovery_alpha_fast: 0.0
    recovery_alpha_slow: 0.0
    resample_interval: 1
    robot_model_type: "nav2_amcl::DifferentialMotionModel"
    save_pose_rate: 0.5
    sigma_hit: 0.2
    tf_broadcast: true
    transform_tolerance: 2.0
    update_min_a: 0.2
    update_min_d: 0.25
    z_hit: 0.5
    z_max: 0.05
    z_rand: 0.5
    z_short: 0.05
    scan_topic: scan
    set_initial_pose: false
```

关于参数的具体含义，可以参考**4.4.1 定位节点说明**中参数相关内容。

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
colcon build --packages-select mycar_local
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
ros2 launch mycar_localization mycar_loca.launch.py
```

（3）启动键盘控制节点以作备用：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard
```

（4）在rviz2中，将Fixed Frme设置为map，添加TF插件，按照 **4.3.6 地图读取基本操作 **添加并显示地图。

接下来，点击rviz2菜单栏的`2D Pose Estimate`在地图中为机器人设置一个初始位姿。

再添加`ParticleCloud`插件，将话题设置为`/particle_cloud`，并将话题下`Reliability Policy`设置为`Best Effort`，最后使用键盘控制机器人运动时，会发现，机器人周边会出现点云，并且随着机器人的运动，点云会出现不同程度的收敛或发散。

![](/assets/4.4.2_位姿初始化3.gif)

