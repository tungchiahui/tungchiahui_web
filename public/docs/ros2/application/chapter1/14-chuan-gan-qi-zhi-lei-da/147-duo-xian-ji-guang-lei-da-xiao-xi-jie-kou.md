### 1.5.7 多线激光雷达消息接口

在ROS2中`sensor_msgs/msg/PointCloud2`接口一般作为多线激光雷达的消息载体，我们可以通过指令`ros2 interface show sensor_msgs/msg/PointCloud2`查看该接口的具体数据结构，结果如下：

```
# 此消息包含一组 N 维点的集合，这些点可能包括额外信息，例如法线、光强度等。
# 点数据以二进制块的形式存储，其布局由 "fields" 数组的内容描述。

# 点云数据可以按照 2D（类似图像）或 1D（无序）进行组织。
# 作为2D图像组织的点云数据可以通过相机深度传感器（如立体或TOF相机）生成。


# 传感器数据采集的时间和三维点的坐标系ID。
std_msgs/Header header
    builtin_interfaces/Time stamp
        int32 sec
        uint32 nanosec
    string frame_id

# 点云的二维结构。如果点云是无序的，则高度为1，宽度为点云的长度。
uint32 height # 点云数据的高度，即点云数据有多少行。
uint32 width  # 点云数据的宽度，即点云数据有多少列。

# 一个数组，包含点云数据中每个点的属性信息，如x、y、z坐标、颜色信息等。
PointField[] fields
    uint8 INT8    = 1
    uint8 UINT8   = 2
    uint8 INT16   = 3
    uint8 UINT16  = 4
    uint8 INT32   = 5
    uint8 UINT32  = 6
    uint8 FLOAT32 = 7
    uint8 FLOAT64 = 8
    string name      # 属性的名称。
    uint32 offset    # 属性在点云数据中的偏移量，以字节为单位。
    uint8  datatype  # 属性的数据类型，如浮点数、整数等。
    uint32 count     # 属性的数量，如 RGB 颜色信息有 3 个值。

bool    is_bigendian # 标识点云数据的字节序，是否为大端字节序（字节序指的是一个多字节数据在内存中存储的顺序。在计算机中，有两种常用的字节序：大端字节序和小端字节序。在大端字节序中，数据的高位字节存储在低地址处，而在小端字节序中，数据的低位字节存储在低地址处）。
uint32  point_step   # 点的长度（以字节为单位）。
uint32  row_step     # 一行的长度（以字节为单位），计算方式为：width*point_step。
uint8[] data         # 所有点数据组成的字节数组。
bool is_dense        # 如果没有无效点，则为True。
```

除了多线激光雷达，深度相机采集的数据也可以使用`sensor_msgs/msgs/PointCloud2`接口进行封装。

