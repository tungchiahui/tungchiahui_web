### 1.7.2 IMU消息接口

在ROS2中imu消息被封装为了`sensor_msgs/msg/Imu`接口，可通过指令`ros2 interface show sensor_msgs/msg/Imu`查看该接口的具体数据结构，结果如下：

```
# 这是一个从惯性测量单元（Inertial Measurement Unit，简称IMU）获取数据的消息。
#
# 加速度应该以米/秒^2为单位（不是以g为单位），旋转速度应该以弧度/秒为单位。
#
# 如果测量的协方差已知，则应该填写相应值。全零的协方差矩阵将被解释为“协方差未知”，必须从其他源获取协方差才能使用协方差数据。
#
# 如果没有其中一个数据元素的估计值（例如，你的IMU不会产生方向估计），请将相关协方差矩阵的第 0 个元素设置为 -1。
# 如果你正在解析此消息，请检查每个协方差矩阵的第一个元素中是否有 -1 的值，并忽略相关的估计值。

std_msgs/Header header # 标头
    builtin_interfaces/Time stamp # 时间戳
        int32 sec
        uint32 nanosec
    string frame_id # imu坐标系

geometry_msgs/Quaternion orientation # 四元数姿态
    float64 x 0
    float64 y 0
    float64 z 0
    float64 w 1
float64[9] orientation_covariance # 姿态协方差矩阵

geometry_msgs/Vector3 angular_velocity # 三轴角速度
    float64 x
    float64 y
    float64 z
float64[9] angular_velocity_covariance # 角速度协方差矩阵

geometry_msgs/Vector3 linear_acceleration # 三轴线性加速度
    float64 x
    float64 y
    float64 z
float64[9] linear_acceleration_covariance # 线性加速度协方差矩阵
```



