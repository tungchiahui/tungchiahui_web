### 2.2.2 雷达过滤器应用

本节我们将通过两个案例来演示laser\_filters功能包的基本使用。

#### 1.准备工作

首先请创建一个功能包，指令如下：

```
ros2 pkg create mycar_laser_filters --dependencies laser_filters
```

然后在功能包下新建launch与params目录，并修改功能包下的CMakeLists.txt文件，添加如下代码：

```
install(DIRECTORY params launch DESTINATION share/${PROJECT_NAME})
```

准备工作完毕，接下来就可以进入案例部分了。

#### 2.过滤无效数据

##### （1）需求

请过滤在激光雷达扫描过程中由于车身遮挡产生的无效数据，已知围绕雷达，车身上安装有四个支柱，四个支柱的扫描结果应视为无效。过滤前，如下图所示，雷达附近包含四个支柱的扫描数据。![](/assets/1.4.6_02box过滤前.PNG)过滤后，如下图所示，去除了四个支柱的扫描数据。![](/assets/1.4.6_03box过滤后.PNG)

##### （2）实现

该需求可以借助于**LaserScanBoxFilter **插件实现，具体步骤如下。

①.编写launch文件，在功能包的launch目录下，新建mycar\_laser\_box\_filter.launch.py文件，并输入如下内容：

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

②.再编写配置文件，在功能包的params目录下，新建box\_filter.yaml文件，并输入如下内容：

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

③.最后构建并执行，执行时，需要先执行底盘与雷达相集成launch文件，再执行当前自实现的launch文件。启动rviz2添加两个laser\_scan插件，一个订阅的话题为/scan，它会显示原生的雷达消息，另一个订阅的话题为/scan\_filtered，它会显示过滤后的雷达消息（为了不混淆，两个插件不建议同时启用）。

#### 3.设置雷达有效范围

##### （1）需求

请根据范围区间过滤雷达数据，雷达有效采集范围为0.2到4.0米，超出此范围视为无效。过滤前的数据如下图所示。

![](/assets/1.4.6_04range过滤前.PNG)过滤后，去除了指定范围外的数据。![](/assets/1.4.6_05range过滤后.PNG)

##### （2）实现

该需求可以借助于**LaserScanRangeFilter **插件实现，具体步骤如下。

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

③.最后构建并执行，执行时，同案例1一样，需要先执行底盘与雷达相集成launch文件，再执行当前自实现的launch文件。启动rviz2添加两个laser\_scan插件，一个订阅的话题为/scan，它会显示原生的雷达消息，另一个订阅的话题为/scan\_filtered，它会显示过滤后的雷达消息（为了不混淆，两个插件不建议同时启用）。

