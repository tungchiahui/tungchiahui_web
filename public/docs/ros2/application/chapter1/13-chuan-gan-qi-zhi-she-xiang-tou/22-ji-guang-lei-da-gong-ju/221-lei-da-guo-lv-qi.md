### 2.2.1 雷达过滤器

在机器人或自动驾驶车辆中，安装的雷达传感器通常会受到车身各个部分的遮挡影响。当车辆的外部结构、天线、摄像头等遮挡了雷达波束的一部分时，这些遮挡物会被雷达误认为是障碍物。这可能导致环境感知的准确性受到影响，并且可能会导致错误的障碍物检测和避障判断。那么如何过滤掉雷达消息中的遮挡物呢？在ROS2中，官方提供了laser\_filters功能包，可用于解决上述问题。

#### 1.功能包简介

laser\_filters字面意思即为雷达过滤器，该包的主要内容是一些用于处理sensor\_msgs/msg/LaserScan消息的通用过滤器。这些过滤器被导出为插件，调用者可以使用单个过滤器插件或将多个过滤器插件组合成过滤器链以处理雷达消息。通过laser\_filters调用者可以剔除雷达消息中的无效信息，保留可用数据。

该功能包的安装指令如下：

```
sudo apt install ros-${ROS_DISTRO}-laser-filters
```

#### 2.节点说明

laser\_filters功能包中有一个较为常用的节点，名为scan\_to\_scan\_filter\_chain，其使用流程如下图所示：

![](/assets/1.4.6_00雷达过滤器使用流程.PNG)

接下来我们就订阅的话题、发布的话题、所需参数、使用示例以及内置插件等内容简单介绍一下该节点。

##### （1）.订阅的话题

scan \(sensor\_msgs/msg/LaserScan\)

* 订阅的雷达消息话题

##### （2）.发布的话题

scan\_filtered \(sensor\_msgs/msg/LaserScan\)

* 发布的雷达消息话题

##### （3）.所需参数

filterN.name

* 过滤器名称

filterN.type

* 过滤器类型

filterN.params

* 过滤器参数

##### （4）.示例

launch文件**multiple\_filters\_example.launch.py**内容如下：

```py
from launch import LaunchDescription
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    return LaunchDescription([
        Node(
            package="laser_filters",
            executable="scan_to_scan_filter_chain",
            parameters=[
                PathJoinSubstitution([
                    get_package_share_directory("laser_filters"),
                    "examples", "multiple_filters_example.yaml",
                ])],
        )
    ])
```

该文件中执行了功能包laser\_filters下的scan\_to\_scan\_filter\_chain节点，并加载了用于配置过滤器的yaml文件。

配置文件**multiple\_filters\_example.yaml**内容如下：

```yaml
scan_to_scan_filter_chain:
  ros__parameters:
    filter1:
      type: laser_filters/LaserArrayFilter
      name: laser_median_5
      params: 
        range_filter_chain:
          filter1:
            name: median_5
            type: filters/MultiChannelMedianFilterFloat 
            params:
              number_of_observations: 5
              unused: 10
        intensity_filter_chain:
          filter2:
            name: median_5
            type: filters/MultiChannelMedianFilterFloat 
            params:
              number_of_observations: 5
              unused: 10
    filter2: 
      name: intensity
      type: laser_filters/LaserScanIntensityFilter
      params:
        lower_threshold: 8000.
        upper_threshold: 100000.
        disp_histogram: 0
    filter3:
      name: shadows
      type: laser_filters/ScanShadowsFilter
      params:
        min_angle: 10.
        max_angle: 170.
        neighbors: 20
        window: 0
    filter4:
      name: dark_shadows
      type: laser_filters/LaserScanIntensityFilter
      params: 
        lower_threshold: 100.
        upper_threshold: 10000.
        disp_histogram: 0
```

在配置文件中，不同的过滤器依次使用filter1、filter2...的方式进行编号，过滤器下会通过name配置过滤器名称，type配置过滤器类型，params配置过滤器所需参数。

##### （5）.插件说明

laser\_filters中处理雷达数据的插件还是比较丰富的，主要有如下几种：

* **LaserArrayFilter **对距离和强度进行过滤。

* **LaserScanIntensityFilter ** 根据强度过滤sensor\_msgs::msg::LaserScan数据。

* **LaserScanRangeFilter ** 根据范围过滤sensor\_msgs::msg::LaserScan信息。

* **ScanShadowsFilter **过滤“拖尾”数据。

* **InterpolationFilter ** 将扫描中出现的异常数据通过使用两侧的正常数据进行补齐。

* **LaserScanAngularBoundsFilter **过滤激光扫描中超出某些角度范围的点。

* **LaserScanAngularBoundsFilterInPlace ** 过滤激光扫描中某些角度范围内的点。

* **LaserScanBoxFilter ** 去除激光扫描中在一个直角坐标盒内的点。

* **LaserScanMaskFilter **过滤指定的激光雷达扫描点。

* **LaserMedianFilter **中值过滤器（已废弃）。

* **LaserScanFootprintFilter ** 过滤掉激光扫描中位于刻线半径内的点（已废弃）。

* **LaserScanSpeckleFilter **过滤掉激光扫描中位于刻线半径内的点（已废弃）。

在该功能包下，关于其具体使用，已经给出了若干示例，示例路径：`/opt/ros/${ROS_DISTRO}/share/laser_filters/examples`。在我们实现雷达过滤功能时，可以参考这些示例。不同的示例，都对应了不同的插件，实现了不同的功能。

![](/assets/1.4.6_01雷达过滤器示例.PNG)

#### 3.应用

接下来，我们通过两个案例来演示laser\_filters功能包的基本使用。

请先创建一个功能包，指令如下：

```
ros2 pkg create mycar_laser_filters --dependencies laser_filters
```

在功能包下新建launch与params目录，并修改功能包下的CMakeLists.txt文件，添加如下代码：

```
install(DIRECTORY params launch DESTINATION share/${PROJECT_NAME})
```

##### （1）.案例1

**需求：**请过滤在激光雷达扫描过程中由于车身遮挡产生的无效数据，已知围绕雷达，车身上安装有四个支柱，四个支柱的扫描结果应视为无效。

过滤前，如下图所示，雷达附近包含四个支柱的扫描数据。![](/assets/1.4.6_02box过滤前.PNG)过滤后，如下图所示，去除了四个支柱的扫描数据。![](/assets/1.4.6_03box过滤后.PNG)

**实现：**

①.首先，编写launch文件，在功能包的launch目录下，新建mycar\_laser\_box\_filter.launch.py文件，并输入如下内容：

```py
from launch import LaunchDescription
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    # 去除一个立方体内扫描到的数据。
    return LaunchDescription([
        Node(
            package="laser_filters",
            executable="scan_to_scan_filter_chain",
            parameters=[
                PathJoinSubstitution([
                    get_package_share_directory("mycar_laser_filters"),
                    "params", "box_filter.yaml",
                ])],
        )
    ])
```

②.然后，再编写配置文件，在功能包的params目录下，新建box\_filter.yaml文件，并输入如下内容：

```yaml
scan_to_scan_filter_chain:
  ros__parameters:
    filter1:
      name: box_filter
      type: laser_filters/LaserScanBoxFilter
      params:
        box_frame: base_footprint #参考坐标系
        max_x: 0.20
        max_y: 0.15
        max_z: 0.5
        min_x: -0.20
        min_y: -0.15
        min_z: 0.0
        # max_x、max_y、max_z、min_x、min_y、min_z声明了不同维度上的最大取值与最小取值，可用于标注立方体。
        invert: false # 是否反转，如果设置为 true，那么会只保留立方体内的数据。
```

③.最后构建并执行，执行时，需要先执行**1.4.1 雷达基本使用**中底盘与雷达相集成launch文件，再执行当前自实现的launch文件。启动rviz2添加两个laser\_scan插件，一个订阅的话题为/scan，它会显示原生的雷达消息，另一个订阅的话题为/scan\_filtered，它会显示过滤后的雷达消息（为了不混淆，两个插件不要同时启用）。

##### （2）.案例2

**需求：**请根据范围区间过滤雷达数据，雷达有效采集范围为0.2到4.0米，超出此范围视为无效。

过滤前的数据如下图所示。

![](/assets/1.4.6_04range过滤前.PNG)过滤后，去除了指定范围外的数据。![](/assets/1.4.6_05range过滤后.PNG)

**实现：**

①.首先，编写launch文件，在功能包的launch目录下，新建mycar\_laser\_scan\_range\_filter.launch.py文件，并输入如下内容：

```py
from launch import LaunchDescription
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    # 去除超出指定范围的数据。
    return LaunchDescription([
        Node(
            package="laser_filters",
            executable="scan_to_scan_filter_chain",
            parameters=[
                PathJoinSubstitution([
                    get_package_share_directory("mycar_laser_filters"),
                    "params", "scan_range_filter.yaml",
                ])],
        )
    ])
```

②.然后，再编写配置文件，在功能包的params目录下，新建scan\_range\_filter.yaml文件，并输入如下内容：

```yaml
scan_to_scan_filter_chain:
  ros__parameters:
    filter1:
      name: range_filter
      type: laser_filters/LaserScanRangeFilter
      params:
        use_message_range_limits: false   
        lower_threshold: 0.2              # 最小阈值，默认0.0
        upper_threshold: 4.0              # 最大阈值，默认100000.0
        lower_replacement_value: -.inf    # 小于最小阈值时的替换值，默认NaN
        upper_replacement_value: .inf     # 大于最大阈值时的替换值，默认NaN
```

③.最后构建并执行，执行时，同案例1一样，需要先执行**1.4.1 雷达基本使用**中底盘与雷达相集成launch文件，再执行当前自实现的launch文件。启动rviz2添加两个laser\_scan插件，一个订阅的话题为/scan，它会显示原生的雷达消息，另一个订阅的话题为/scan\_filtered，它会显示过滤后的雷达消息（为了不混淆，两个插件不要同时启用）。

