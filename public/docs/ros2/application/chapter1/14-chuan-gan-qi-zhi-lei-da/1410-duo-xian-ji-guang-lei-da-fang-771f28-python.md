### 1.5.10 多线激光雷达仿真\(Python\)

#### 1.发布方实现

功能包py02\_laser的py02\_laser目录下，新建Python文件sim\_laser\_py.py，并编辑文件，输入如下内容：

```py
"""  
    需求：发布点云数据，点云共50行100列，且可以沿X轴周期性运动。
    流程：
        1.导包；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建发布方；
          3-2.创建定时器；
          3-3.组织并发布数据。
        4.调用spin函数，并传入节点对象指针；
        5.资源释放。

"""
# 1.导包；
import numpy as np

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import PointCloud2
from sensor_msgs.msg import PointField
from std_msgs.msg import Header

# 3.自定义节点类；
class LaserPublisher(Node):
    def __init__(self):
        super().__init__("laser_publisher_node_py")
        self.publisher_ = self.create_publisher(PointCloud2, '/pcl', 10)
        self.rate = 3
        timer_period = 1 / self.rate
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.counter = 0

    def timer_callback(self):
        #  创建点云对象
        pc2_msg = PointCloud2()
        #  设置点云宽度与高度
        width = 100
        height = 50
        # 设置点云消息标头(时间戳与坐标系)
        header = Header()
        header.frame_id = 'laser'
        header.stamp = self.get_clock().now().to_msg()

        # 设置点云坐标点属性
        dtype = PointField.FLOAT32
        fields = [PointField(name='x', offset=0, datatype=dtype, count=1),
                PointField(name='y', offset=4, datatype=dtype, count=1),
                PointField(name='z', offset=8, datatype=dtype, count=1),
                PointField(name='intensity', offset=12, datatype=dtype, count=1)]


        pc2_msg.header = header

        pc2_msg.height = height
        pc2_msg.width = width

        pc2_msg.fields = fields
        # 是否为大端字节序
        pc2_msg.is_bigendian = True
        # 设置每个点的长度
        pc2_msg.point_step = 16
        # 设置一行的长度
        pc2_msg.row_step = pc2_msg.point_step * width

        # 生成点云数据
        # 创建一个三维数组，height为行，width为列，4是每个点的元素个数，dtype为元素数据类型
        points = np.zeros((height,width,4),dtype=np.float32)
        x =1.0 - self.counter % 30 * 0.02
        for i in range(0, height):
            for j in range(0, width):
                point = [x,1.0 - 0.02 * j,1.0 - 0.02 * i,i * j]
                points[i][j] = point
        pc2_msg.data = points.tobytes()
        # 是否有无效点
        pc2_msg.is_dense = True
        self.publisher_.publish(pc2_msg)

        self.counter += 1

def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(LaserPublisher())
    # 5.资源释放。 
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

##### 1.package.xml {#1packagexml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclpy</depend>
<depend>sensor_msgs</depend>
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
    'console_scripts': [
        'sim_laser_py = py02_laser.sim_laser_py:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py02_laser
```

#### 4.执行

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py02_laser sim_laser_py
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为laser，添加点云消息插件PointCloud2并将话题设置为pcl，最终运行结果与演示案例类似。

