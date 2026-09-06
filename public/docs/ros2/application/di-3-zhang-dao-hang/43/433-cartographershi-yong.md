### 4.3.3 地图接口

在Nav2中地图相关的接口主要有两个：

* **nav\_msgs/msg/MapMetaData** - 地图元数据，包括地图的宽度、高度、分辨率等。
* **nav\_msgs/msg/OccupancyGrid** - 地图栅格数据，一般会在rviz中以图形化的方式显示。

#### 1.**nav\_msgs/msg/MapMetaData**

调用指令`ros2 interface show nav_msgs/msg/MapMetaData`查看接口格式，显示如下内容（注释已汉化）：

```
# 它包含了关于OccupancyGrid特性的基本信息
# 地图加载时间
builtin_interfaces/Time map_load_time
        int32 sec
        uint32 nanosec

# 地图分辨率 [米/像素]
float32 resolution

# 地图宽度 [像素]
uint32 width

# 地图高度 [像素]
uint32 height

#地图的原点坐标[米，米，弧度]。这是地图中单元格(0,0)左下角在现实世界中的位置和方向。
geometry_msgs/Pose origin
        Point position
                float64 x
                float64 y
                float64 z
        Quaternion orientation
                float64 x 0
                float64 y 0
                float64 z 0
                float64 w 1
```

#### 2.**nav\_msgs/msg/OccupancyGrid**

调用指令`ros2 interface show nav_msgs/msg/OccupancyGrid`查看接口格式，显示如下内容（注释已汉化）：

```
# 它代表一个二维网格地图。
std_msgs/Header header
        builtin_interfaces/Time stamp
                int32 sec
                uint32 nanosec
        string frame_id

# 地图元数据
MapMetaData info
        builtin_interfaces/Time map_load_time
                int32 sec
                uint32 nanosec
        float32 resolution
        uint32 width
        uint32 height
        geometry_msgs/Pose origin
                Point position
                        float64 x
                        float64 y
                        float64 z
                Quaternion orientation
                        float64 x 0
                        float64 y 0
                        float64 z 0
                        float64 w 1

# 地图数据按照行优先的顺序进行排列，
# 这意味着首先填充第一行的所有单元格，
# 然后填充第二行，依此类推。
# 起始单元格是(0,0)，也就是地图的左上角。
# 单元格(1, 0)紧接着(0,0)，是x方向上紧邻的下一个单元格。
# 而单元格(0, 1)则位于第一行的第二个位置，其索引等于地图的宽度（info.width），
# 然后才是(1, 1)单元格，即第二行的第二个单元格。

# 关于地图数据的值，它们根据具体的应用需求来定义。但在很多情况下，
# 会使用0表示该单元格是未占用的，即机器人可以安全通过；
# 1表示该单元格是确定占用的，即存在障碍物；
# 而-1表示该单元格的状态是未知的，即机器人尚未探测到该区域的状态。
int8[] data
```



