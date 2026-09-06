### 1.6.3 相机相关消息接口

在ROS2中`sensor_msgs/msg/Image`接口是描述相机消息的最重要的载体之一，我们可以通过指令`ros2 interface show sensor_msgs/msg/Image`查看该接口的具体数据结构，结果如下：

```
# 此消息包含了一张未压缩的图片

std_msgs/Header header
    builtin_interfaces/Time stamp
        int32 sec
        uint32 nanosec
    string frame_id          # header的frame_id应该是相机的光学坐标系，坐标系的原点应该是相机的光学中心

uint32 height                # 图像高度，即行数。
uint32 width                 # 图像宽度，即列数。

string encoding       # 像素的编码方式 - 通道含义、排序和大小
                      # 可从include/sensor_msgs/image_encodings.hpp中的字符串列表中获取

uint8 is_bigendian    # 这个数据的字节序是大端序还是小端序？
uint32 step           # 每一行的数据长度（以字节为单位）
uint8[] data          # 实际的矩阵数据，大小为(step * rows)
```

`sensor_msgs/msg/Image`常用于表示图片信息，不管是单目、双目还是深度相机，该接口都有着广泛的应用。另外如果是深度相机那么还和点云数据`sensor_msgs/msg/PointCloud2`有着密切的关系，该接口在**1.5.7 多线激光雷达消息接口**一节中已经有详细介绍，在此不再赘述。

