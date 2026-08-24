### 4.2.4 slam\_toolbox基本使用

#### 1.准备工作

在src目录下，请先调用如下指令在工作空间的src目录下创建一个功能包：

```
ros2 pkg create mycar_slam_slam_toolbox --dependencies slam_toolbox
```

#### 2.编写launch文件与参数文件

在功能包下，新建launch目录和params目录，launch目录下新建`online_sync_launch.py`文件并输入如下内容：

```py
import os

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    use_sim_time = LaunchConfiguration('use_sim_time')
    slam_params_file = LaunchConfiguration('slam_params_file')

    declare_use_sim_time_argument = DeclareLaunchArgument(
        'use_sim_time',
        default_value='false',
        description='Use simulation/Gazebo clock')
    declare_slam_params_file_cmd = DeclareLaunchArgument(
        'slam_params_file',
        default_value=os.path.join(get_package_share_directory("mycar_slam_slam_toolbox"),
                                   'params', 'mapper_params_online_sync.yaml'),
        description='Full path to the ROS2 parameters file to use for the slam_toolbox node')

    start_sync_slam_toolbox_node = Node(
        parameters=[
          slam_params_file,
          {'use_sim_time': use_sim_time}
        ],
        package='slam_toolbox',
        executable='sync_slam_toolbox_node',
        name='slam_toolbox',
        output='screen')

    ld = LaunchDescription()

    ld.add_action(declare_use_sim_time_argument)
    ld.add_action(declare_slam_params_file_cmd)
    ld.add_action(start_sync_slam_toolbox_node)

    return ld
```

该launch文件主要是加载了slam\_toolbox下的sync\_slam\_toolbox\_node节点，并且会从当前功能包的params下读取一个名为`mapper_params_online_sync.yaml`的配置文件。这个配置文件还不存在，接下来需要在params目录下新建`mapper_params_online_sync.yaml`文件，并输入如下内容：

```yaml
slam_toolbox:
  ros__parameters:
    solver_plugin: solver_plugins::CeresSolver
    ceres_linear_solver: SPARSE_NORMAL_CHOLESKY
    ceres_preconditioner: SCHUR_JACOBI
    ceres_trust_strategy: LEVENBERG_MARQUARDT
    ceres_dogleg_type: TRADITIONAL_DOGLEG
    ceres_loss_function: None

    odom_frame: odom
    map_frame: map
    base_frame: base_link
    scan_topic: /scan
    mode: mapping #localization


    #map_file_name: test_steve
    #map_start_pose: [0.0, 0.0, 0.0]
    #map_start_at_dock: true

    debug_logging: false
    throttle_scans: 1
    transform_publish_period: 0.02 
    map_update_interval: 2.0
    resolution: 0.05
    max_laser_range: 20.0 
    minimum_time_interval: 0.5
    transform_timeout: 0.2
    tf_buffer_duration: 30.
    stack_size_to_use: 40000000 
    enable_interactive_mode: true

    use_scan_matching: true
    use_scan_barycenter: true
    minimum_travel_distance: 0.1
    minimum_travel_heading: 0.1
    scan_buffer_size: 100
    scan_buffer_maximum_scan_distance: 10.0
    link_match_minimum_response_fine: 0.1  
    link_scan_maximum_distance: 1.5
    loop_search_maximum_distance: 3.0
    do_loop_closing: true 
    loop_match_minimum_chain_size: 10           
    loop_match_maximum_variance_coarse: 3.0  
    loop_match_minimum_response_coarse: 0.35    
    loop_match_minimum_response_fine: 0.45

    correlation_search_space_dimension: 0.5
    correlation_search_space_resolution: 0.01
    correlation_search_space_smear_deviation: 0.1 

    loop_search_space_dimension: 8.0
    loop_search_space_resolution: 0.05
    loop_search_space_smear_deviation: 0.03

    distance_variance_penalty: 0.5      
    angle_variance_penalty: 1.0    

    fine_search_angle_offset: 0.00349     
    coarse_search_angle_offset: 0.349   
    coarse_angle_resolution: 0.0349        
    minimum_angle_penalty: 0.9
    minimum_distance_penalty: 0.5
    use_response_expansion: true
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
colcon build --packages-select mycar_slam_slam_toolbox
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
ros2 launch mycar_slam_slam_toolbox online_sync_launch.py use_sim_time:=True
```

（3）启动rviz2，将Fixed Frame设置为map，添加map插件并将话题设置为/map，即可显示slam\_toolbox创建的地图了，当机器人运动时，地图也会随之更新。

![](/assets/4.2.3_slam_toolbox使用.gif)

最后需要说明的是，本节内容使用的是`sync_slam_toolbox_node` 节点，即以同步方式建图，而异步建图节点`async_slam_toolbox_node` 的使用与同步类似。

